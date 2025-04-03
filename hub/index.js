const express = require("express")();
const WebSocket = require("ws");
const dns2 = require("dns2");
const color = require("colors");

require("dotenv").config();
class BoundedMap extends Map {
  constructor(maxSize) {
    super();
    this.maxSize = maxSize;
  }

  set(key, value) {
    super.set(key, value);

    if (this.size > this.maxSize) this.delete(this.keys().next().value);
  }
}

let cache = new BoundedMap(process.env.CACHE_SIZE | 20);
let globalWS;
const debug = false;

startWS();
startDNS();

async function startWS() {
  const server = require("http").createServer(express);
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    console.log(color.blue("Pihole connected"));
    let receivedAccessCode = false;

    ws.on("message", (msg) => {
      if (!receivedAccessCode) {
        if (msg == process.env.ACCESS_CODE) {
          receivedAccessCode = true;
          globalWS = ws;

          console.log(color.green("Pihole authenticated"));
        } else {
          ws.close(1002, "Access codes do not match.");
          return;
        }
      }
    });
  });

  server.listen(process.env.WSS_PORT, () => console.log(color.green(`WSS is running on port ${color.white(process.env.WSS_PORT)}`)));
}

async function startDNS() {
  const server = dns2.createServer({
    udp: true,
    handle: (request, send, rinfo) => {
      const start = Date.now();
      let cachedResponse = false;

      let response = dns2.Packet.createResponseFromRequest(request);

      if (!globalWS) {
        send(response);
        return;
      }

      const msgCallback = (msg) => {
        const data = JSON.parse(msg);

        if (data.domain == question.name) {
          response.answers = data.resolved.answers;
          globalWS.removeListener("message", msgCallback);

          if (debug) console.log("Out:", request);
          send(response);
        }
      }

      const question = request.questions[0]

      const cacheResponse = cache.get(question.name);
      if (cacheResponse == null) {
        globalWS.send(JSON.stringify(question));
        globalWS.on("message", msgCallback);
      } else {
        response.answers = cacheResponse;

        send(response);
        cachedResponse = true;
      }

      const end = Date.now();

      cache.set(question.name, response.answers);

      //console.log(color.green(`Resolved ${request.questions.map((q) => q.name).join(", ")} (${color.white(end - start)}ms)`)); // Uncomment this if you want domains in the logs
      console.log(color.green(`Resolved in ${color.white(`${end - start}ms`)}${cachedResponse ? " (cache)" : ""}`));
    }
  });

  server.on("request", (request, response, rinfo) => {
    if (debug) console.log("In:", request);
  });

  server.on("requestError", (error) => {
    console.log(color.red("Client sent an invalid request"), error);
  });

  server.on("close", () => {
    console.log(color.yellow("DNS server closed"));
  });

  server.on("listening", () => {
    console.log(color.green("DNS server started on port"), process.env.DNS_PORT);
  })

  server.listen({
    udp: {
      port: process.env.DNS_PORT,
      address: process.env.DNS_INTERFACE,
      type: "udp4",
    },
  });
}