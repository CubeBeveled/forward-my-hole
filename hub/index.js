const express = require("express")();
const color = require("colors");
const WebSocket = require("ws");
const dns2 = require("dns2");
const tls = require("tls");

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
startDoUDP();
startDoT();

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

const msgCallback = (msg) => {
  const data = JSON.parse(msg);

  if (data.domain == question.name) {
    response.answers = data.resolved.answers;
    globalWS.removeListener("message", msgCallback);

    if (debug) console.log("Out:", request);
    send(response);
  }
};

const handleQuery = (request, send) => {
  let response = dns2.Packet.createResponseFromRequest(request);

  if (!globalWS) {
    send(response);
    return;
  }

  const question = request.questions[0]
  const cacheResponse = cache.get(question.name);
  if (cacheResponse == null) {
    globalWS.send(JSON.stringify(question));
    globalWS.on("message", msgCallback);
  } else {
    response.answers = cacheResponse;

    send(response);
  }

  cache.set(question.name, response.answers);
}

function startDoUDP() {
  const server = dns2.createServer({
    udp: true,
    handle: (request, send, rinfo) => {
      const start = Date.now();
      handleQuery(request, send)
      const end = Date.now();

      //console.log(color.green(`Resolved ${request.questions.map((q) => q.name).join(", ")} (${color.white(end - start)}ms)`)); // Uncomment this if you want domains in the logs
      console.log(color.green(`[UDP] Resolved in ${color.white(`${end - start}ms`)}`));
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
    console.log(color.green("[UDP] DNS server started on port"), process.env.DNS_PORT);
  })

  server.listen({
    udp: {
      port: process.env.DNS_PORT,
      address: process.env.DNS_INTERFACE,
      type: "udp4",
    },
  });
}

/*

// Add these to .env
//TLS_PORT=853
//TLS_INTERFACE=""0.0.0.0""

const options = {
  key: fs.readFileSync("server.key"),
  cert: fs.readFileSync("server.pem")
};

function startDoT() {
  const tlsServer = tls.createServer(options, (socket) => {
    socket.on("data", async (data) => {
      const request = Packet.parse(data);

      handleQuery(request, (response) => {
        socket.write(Packet.write(response));
        socket.end();
      });
    });
  });

  tlsServer.listen(853, process.env.TLS_INTERFACE, () => {
    console.log(color.green("[TLS] DNS server started on port"), process.env.TLS_PORT);
  });
}
*/