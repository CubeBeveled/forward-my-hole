const express = require("express")();
const dns2 = require("dns2");
const WebSocket = require("ws");

require("dotenv").config();

let globalWS;

startWS();
startDNS();

async function startWS() {
  const server = require("http").createServer(express);
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    console.log("Pihole connected");
    let receivedAccessCode = false;

    ws.on("message", (msg) => {
      if (!receivedAccessCode) {
        if (msg == process.env.ACCESS_CODE) {
          receivedAccessCode = true;
          globalWS = ws;

          console.log("Pihole authenticated");
        } else {
          ws.close(1002, "Access codes do not match.");
          return;
        }
      }
    });
  });

  server.listen(process.env.WSS_PORT, () => console.log(`WSS is running on port ${process.env.WSS_PORT}`));
}

async function startDNS() {
  const server = dns2.createServer({
    udp: true,
    handle: (request, send, rinfo) => {
      const response = dns2.Packet.createResponseFromRequest(request);

      const msgCallback = (msg) => {
        const data = JSON.parse(msg);

        if (data.domain == currentQuestion.name) {
          data.resolved.forEach(ip => response.answers.push(ip));
          ws.removeListener('message', msgCallback);
        }
      }

      for (const currentQuestion of request.questions) {
        globalWS.send(currentQuestion.name);


        globalWS.on("message", msgCallback);
      }

      send(response);

      console.log(`Resolved ${request.questions.join(", ")}`)
    }
  });

  server.on("requestError", (error) => {
    console.log("Client sent an invalid request", error);
  });

  server.on("close", () => {
    console.log("DNS server closed");
  });

  server.on("listening", () => {
    console.log("DNS server started on port", process.env.DNS_PORT)
  })

  server.listen({
    udp: {
      port: process.env.DNS_PORT,
      address: "127.0.0.1",
      type: "udp4",
    },
  });
}