const WebSocket = require("ws");
const color = require("colors");
const { UDPClient, Packet } = require("dns2");

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
  Packet.TYPE
  socket.on("open", () => {
    socket.send(process.env.ACCESS_CODE);
    console.log(color.green("Connected to hub"));
  });

  socket.on("message", async (msg) => {
    const data = JSON.parse(msg.toString())
    let resolved;

    const start = Date.now();

    try {
      resolved = await UDPClient({
        dns: process.env.PIHOLE_ADDRESS,
      })(data.name, data.type, data.class);

      socket.send(JSON.stringify({ domain: data.name, resolved }));
    } catch (err) {
      console.log(color.red("Error resolving"), data.name)
      console.log(err);
      return;
    }

    const end = Date.now();

    console.log(color.green(`Resolved ${color.white(data.name)} -> ${color.white(resolved.answers)} (${color.white(`${end - start}ms`)})`));
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

// finish this function and
// put this instead of data.type
/*
resolved = await UDPClient({
        dns: process.env.PIHOLE_ADDRESS,
      })(data.name, numberToString(data.type), data.class);
 */
function numberToString(number) {
  const rawTypes = Object.entries({
    A: 0x01,
    NS: 0x02,
    MD: 0x03,
    MF: 0x04,
    CNAME: 0x05,
    SOA: 0x06,
    MB: 0x07,
    MG: 0x08,
    MR: 0x09,
    NULL: 0x0a,
    WKS: 0x0b,
    PTR: 0x0c,
    HINFO: 0x0d,
    MINFO: 0x0e,
    MX: 0x0f,
    TXT: 0x10,
    AAAA: 0x1c,
    SRV: 0x21,
    EDNS: 0x29,
    SPF: 0x63,
    AXFR: 0xfc,
    MAILB: 0xfd,
    MAILA: 0xfe,
    ANY: 0xff,
    CAA: 0x101
  });

  const finalMap = new Map();
}