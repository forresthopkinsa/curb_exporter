const fs = require("fs");
const express = require("express");
const fetch = require("node-fetch");
const prom = require("prom-client");
const yaml = require("js-yaml");

const config = yaml.load(fs.readFileSync(process.argv[2] ?? "config.yml"));

const CACHE_EXPIRY = 10_000;
const PORT = process.env.PORT ?? 9895;
const CURB_URL = "https://app.energycurb.com";
const CURB_CLIENT_ID = config?.curb?.client?.id;
const CURB_CLIENT_SECRET = config?.curb?.client?.secret;
const CURB_EMAIL = config?.curb?.user?.email;
const CURB_PASSWORD = config?.curb?.user?.password;

if (!CURB_CLIENT_ID || !CURB_CLIENT_SECRET || !CURB_EMAIL || !CURB_PASSWORD)
  throw new Error("Invalid configuration");

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

prom.collectDefaultMetrics();

/*
key: string
arr: { val: any, ...labels }[]
doc?: { help: string, type: "counter" | "gauge" | "histogram" | "summary" }
*/
function createMetricString(key, arr, doc) {
  let str = "";
  if (doc) {
    str += `# HELP ${key} ${doc.help}\n`;
    str += `# TYPE ${key} ${doc.type}\n`;
  }
  for (const { val, ...labels } of arr) {
    const labelEntries = Object.entries(labels);
    const labelStr =
      labelEntries.length &&
      labelEntries
        .reduce((acc, [k, v]) => (acc += `,${k}="${v}"`), "")
        .slice(1);
    str += `${key}${labelStr ? `{${labelStr}}` : ""} ${val}\n`;
  }
  return str.trim();
}

function dtoToMetrics(obj) {
  return `${createMetricString(
    "curb_consumption_watts",
    [{ val: obj.consumption }],
    { help: "The current household energy consumption.", type: "gauge" }
  )}
${createMetricString("curb_production_watts", [{ val: -obj.production }], {
  help: "The current household energy production.",
  type: "gauge",
})}
${createMetricString("curb_storage_watts", [{ val: obj.storage }], {
  help: "The current household energy storage.",
  type: "gauge",
})}
${createMetricString(
  "curb_circuit_consumption_watts",
  obj.circuits.map(({ w, ...rest }) => ({
    val: w,
    ...rest,
  })),
  {
    help: "Individual circuit consumption levels. Negative for production circuits.",
    type: "gauge",
  }
)}`;
}

async function getAccessTokenCore() {
  console.log("Fetching new access token");
  const body = {
    grant_type: "password",
    audience: "app.energycurb.com/api",
    username: CURB_EMAIL,
    password: CURB_PASSWORD,
    client_id: CURB_CLIENT_ID,
    client_secret: CURB_CLIENT_SECRET,
  };
  const resp = await fetch("https://energycurb.auth0.com/oauth/token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return {
    token: data.access_token,
    expiry: new Date(Date.now() + data.expires_in),
  };
}

let tokenPromise;
async function getAccessToken() {
  if (!tokenPromise || (await tokenPromise).expiry <= Date.now() + 500)
    tokenPromise = getAccessTokenCore();
  return (await tokenPromise).token;
}

async function getEndpointCore(route) {
  const accessToken = await getAccessToken();
  const resp = await fetch(`${CURB_URL}${route}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  return { data: await resp.json(), expiry: Date.now() + CACHE_EXPIRY };
}

const apiCache = {};
async function getEndpoint(route) {
  if (!apiCache[route] || (await apiCache[route]).expiry <= Date.now())
    apiCache[route] = getEndpointCore(route);
  return (await apiCache[route]).data;
}

async function getLocations() {
  return getEndpoint("/api/v3/locations");
}

async function getLatest(locationId) {
  return getEndpoint(`/api/v3/latest/${locationId}`);
}

async function getAggregate(locationId, rangeId, resolution) {
  return getEndpoint(
    `/api/v3/aggregate/${locationId}/${rangeId}/${resolution}`
  );
}

app.get("/", (req, res) =>
  res.send(`
    <a href="/locations">Locations</a>
    <br/>
    <a href="/latest">Latest</a>
    <br/>
    <a href="/aggregate">Aggregate</a>
  `)
);

app.get("/locations", async (req, res) => res.send(await getLocations()));

app.get("/latest", async (req, res) => {
  const locationId = req.query.target;
  if (!locationId) res.status(400).send("target parameter required");
  else
    try {
      res
        .set("Content-Type", "text/plain")
        .send(dtoToMetrics(await getLatest(locationId)));
    } catch (e) {
      console.error(e);
      res.status(500).send(e.message);
    }
});

app.get("/aggregate", async (req, res) => {
  const { target: locationId, range: rangeId, res: resolution } = req.query;
  if (!locationId || !rangeId || !resolution)
    res.status(400).send("target, range, and res parameters required");
  else res.send(await getAggregate(locationId, rangeId, resolution));
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", "text/plain").send(await prom.register.metrics());
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
