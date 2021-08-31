require("dotenv").config();

const express = require("express");
const fetch = require("node-fetch");

const PORT = process.env.PORT ?? 3000;
const CURB_URL = "https://app.energycurb.com";
const { CURB_CLIENT_ID, CURB_CLIENT_SECRET, CURB_EMAIL, CURB_PASSWORD } =
  process.env;

const app = express();
app.use(express.json());

async function getAccessTokenCore() {
  console.log("Fetching new access token...");
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

async function getEndpoint(route) {
  const accessToken = await getAccessToken();
  const resp = await fetch(`${CURB_URL}${route}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  return await resp.json();
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
  else res.send(await getLatest(locationId));
});

app.get("/aggregate", async (req, res) => {
  const { target: locationId, range: rangeId, res: resolution } = req.query;
  if (!locationId || !rangeId || !resolution)
    res.status(400).send("target, range, and res parameters required");
  else res.send(await getAggregate(locationId, rangeId, resolution));
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
