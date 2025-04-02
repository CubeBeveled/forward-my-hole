const WebSocket = require("ws");
const dns = require("dns");

const sleep = (ms) => {
  return new Promise((r) => {
    setTimeout(r, ms);
  });
};

require("dotenv").config();

let restarting = false;

connectToHub();

function connectToHub() {
  restarting = false;

  let socket = new WebSocket(process.env.HUB_ADDRESS);

  socket.on("open", () => {
    console.log("Connecting to hub");
    socket.send(process.env.ACCESS_CODE)
  });

  socket.on("message", async (msg) => {
    const strMsg = msg.toString()
    let resolved;

    try {
      resolved = await resolve(strMsg);
      console.log("Resolved", strMsg);
    } catch (err) {
      console.log("Error resolving", strMsg)
      console.log(err);
    }

    socket.send({ domain: strMsg, resolved });
  });

  socket.on("error", (err) => {
    console.log("Socket error:", err)
  });

  socket.on("close", async (code, reason) => {
    console.log("Disconnected from hub:", `(${code}) ${reason}`);

    if (code == 1002) {
      process.exit(0);
    }

    if (restarting) return;
    restarting = true;

    await sleep(500) // Reconnect delay (0.5s by default)
    connectToHub()
  });
}

function resolve(domain) {
  return new Promise((resolve, reject) => {
    
    dns.setServers([process.env.PIHOLE_ADDRESS]);

    dns.resolve4(domain, (err, addresses) => {
      if (err) {
        console.log(color.yellow(`Error: Pihole did not respond. Using fallback (${color.white(process.env.FALLBACK_DNS)})`));

        dns.setServers([process.env.FALLBACK_DNS]);

        dns.resolve4(domain, (err, addresses) => {
          if (err) {
            console.log(color.red("Error: Fallback DNS failed:"), err);

            resolve(null);
          } else resolve(addresses);
        });
      } else resolve(addresses);
    });
  });
}