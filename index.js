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
  if (tokenPromise && (await tokenPromise).expiry > Date.now())
    return (await tokenPromise).token;
  return (tokenPromise = getAccessTokenCore());
}

app.get("/", (req, res) =>
  res.send({ CURB_CLIENT_ID, CURB_CLIENT_SECRET, CURB_EMAIL, CURB_PASSWORD })
);

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
