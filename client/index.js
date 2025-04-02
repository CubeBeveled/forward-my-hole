const WebSocket = require("ws");
const color = require("colors");
const dns = require("dns");
const { Packet, UDPClient } = require("dns2");

const sleep = (ms) => {
  return new Promise((r) => {
    setTimeout(r, ms);
  });
};

const dnsCallback = (err, addresses) => {
  if (err) {
    console.log(color.yellow(`Error: Pihole did not respond. Using fallback (${color.white(process.env.FALLBACK_DNS)})`));

    dns.setServers([process.env.FALLBACK_DNS]);

    dns.resolve4(domain, dnsErrorCallback);
  } else resolve(addresses);
};

const dnsErrorCallback = (err, addresses) => {
  if (err) {
    console.log(color.red("Error: Fallback DNS failed:"), err);

    resolve(null);
  } else resolve(addresses);
}

require("dotenv").config();

let restarting = false;

connectToHub();

function connectToHub() {
  restarting = false;

  let socket = new WebSocket(process.env.HUB_ADDRESS);

  socket.on("open", () => {
    socket.send(process.env.ACCESS_CODE);
    console.log(color.green("Connected to hub"));
  });

  socket.on("message", async (msg) => {
    const data = JSON.parse(msg.toString())
    let resolved;

    const start = Date.now();

    try {
      resolved = await resolve(data.name, data.type, data.class);
      socket.send(JSON.stringify({ domain: data.name, resolved }));
    } catch (err) {
      console.log(color.red("Error resolving"), strMsg)
      console.log(err);
    }

    const end = Date.now();

    console.log(`Resolved ${color.white(strMsg)} (${color.white(end - start)}ms)`);
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

async function resolve(domain, type, cclass) {
  const resolved = [];

  let data;
  let extra = {}

  if (type === Packet.TYPE.A) {  // 'A' Record (IPv4 Address)
    data = await resolveA(domain)
    extra.address = data;
  } else if (type === Packet.TYPE.AAAA) {  // 'AAAA' Record (IPv6 Address)
    data = await resolveAAAA(domain)
    extra.address = data;
  } else if (type === Packet.TYPE.MX) {  // 'MX' Record (Mail Exchange)
    // Return an MX record for the domain
    data = await resolveMX(domain);

    resolver.push({
      name: domain,
      type: Packet.TYPE.MX, // MX record type
      class: Packet.CLASS.IN,
      ttl: 60,
      priority: 10,  // Priority for mail exchange
      exchange: 'mail.example.com',  // Mail server domain
    });

    extra.exchange = data;
    extra.priority = data;
  } else if (type === Packet.TYPE.CNAME) {  // 'CNAME' Record (Canonical Name)
    // Return a CNAME record for the domain
    data = await resolveA(domain);

    resolver.push({
      name: domain,
      type: Packet.TYPE.CNAME, // CNAME record type
      class: Packet.CLASS.IN,
      ttl: 60,
      target: 'example.com',
    });
  } else if (type === Packet.TYPE.TXT) {  // 'TXT' Record (Text)
    data = await resolveA(domain);

    resolver.push({
      name: domain,
      type: Packet.TYPE.TXT,
      class: Packet.CLASS.IN,
      ttl: 60,
      text: ,  // Example text (SPF)
    });
  }

  resolved.push(data.map((d) => {
    d.name = data.address;
    d.type = type;
    d.class = cclass;
    d.ttl = data.ttl;
  }));
}

function resolveA(domain) {
  return new Promise((resolve, reject) => {

    dns.setServers([process.env.PIHOLE_ADDRESS]);

    dns.resolve4(domain, { ttl: true }, dnsCallback);
  });
}

function resolveAAAA(domain) {
  return new Promise((resolve, reject) => {

    dns.setServers([process.env.PIHOLE_ADDRESS]);

    dns.resolve6(domain, { ttl: true }, dnsCallback);
  });
}

function resolveMX(domain) {
  return new Promise((resolve, reject) => {

    dns.setServers([process.env.PIHOLE_ADDRESS]);

    dns.resolveMX(domain, {}, dnsCallback);
  });
}

function resolveTXT(domain) {
  return new Promise((resolve, reject) => {

    dns.setServers([process.env.PIHOLE_ADDRESS]);

    dns.resolveTXT(domain, { ttl: true }, dnsCallback);
  });
}