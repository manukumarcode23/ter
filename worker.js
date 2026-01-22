export default {
  async fetch(request) {
    try {
      const { searchParams } = new URL(request.url);

      const cookiesParam = searchParams.get("cookies");
      const inputUrl = searchParams.get("url");

      if (!cookiesParam || !inputUrl) {
        return new Response(
          "Usage: ?cookies=cookie1||cookie2||cookie3&url=https://terabox.com/s/xxxx",
          { status: 400 }
        );
      }

      const cookiePool = cookiesParam.split("||").map(c => c.trim()).filter(Boolean);
      if (!cookiePool.length) {
        return new Response("No cookies provided", { status: 400 });
      }

      const cookieConfig = getCurrentCookieConfig(cookiePool);

      // Extract surl
      const surl = extractSurl(inputUrl);
      if (!surl) {
        return new Response("Invalid URL. surl not found.", { status: 400 });
      }

      // Extract jsToken
      const jsToken = await extractJsToken(cookieConfig, surl);
      if (!jsToken) {
        return new Response("Failed to extract jsToken", { status: 500 });
      }

      // Call Share List API
      const params = new URLSearchParams({
        clienttype: "5",
        jsToken: jsToken,
        shorturl: surl,
        root: "1"
      });

      const apiUrl = `https://${cookieConfig.host}/share/list?${params.toString()}`;
      const apiRes = await makeRequest(apiUrl, cookieConfig);

      let data;
      try {
        data = await apiRes.json();
      } catch {
        const txt = await apiRes.text();
        return new Response(txt, { status: 500 });
      }

      data.cookie_used = cookieConfig.id;
      data.host_used = cookieConfig.host;

      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (e) {
      return new Response("Internal Error: " + e.message, { status: 500 });
    }
  }
};

/* ===================== FUNCTIONS ===================== */

function getCurrentCookieConfig(cookiePool) {
  const index = Math.floor(Math.random() * cookiePool.length);
  return {
    id: `cookie-${index + 1}`,
    host: "dm.terabox.app",
    cookie: cookiePool[index]
  };
}

function extractSurl(url) {
  let m = url.match(/surl=([^&]+)/);
  if (m) return m[1];

  m = url.match(/\/s\/([^/?&]+)/);
  if (m) {
    let surl = m[1];
    if (surl.startsWith("1")) surl = surl.slice(1);
    return surl;
  }
  return null;
}

async function makeRequest(url, cookieConfig) {
  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13)",
      "Accept": "*/*",
      "Cookie": cookieConfig.cookie,
      "Referer": "https://terabox.com/",
      "Origin": "https://terabox.com"
    }
  });
}

function findBetween(text, start, end) {
  try {
    const s = text.indexOf(start) + start.length;
    const e = text.indexOf(end, s);
    return text.substring(s, e);
  } catch {
    return "";
  }
}

function extractTokenFromScript(html, tokenName) {
  const patterns = [
    new RegExp(`var\\s+${tokenName}\\s*=\\s*['"]([^'"]+)['"]`),
    new RegExp(`"${tokenName}"\\s*:\\s*"([^"]+)"`),
    new RegExp(`${tokenName}%3D([^%&]+)`),
    new RegExp(`${tokenName}\\s*=\\s*([^&\\s]+)`)
  ];

  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return "";
}

async function extractJsToken(cookieConfig, surl) {
  const pageUrl = `https://${cookieConfig.host}/sharing/link?surl=${surl}`;
  const r = await makeRequest(pageUrl, cookieConfig);
  const html = await r.text();

  let jsToken = findBetween(html, 'fn%28%22', '%22%29');
  if (!jsToken) jsToken = findBetween(html, 'fn("', '")');
  if (!jsToken) jsToken = findBetween(html, '"jsToken":"', '"');
  if (!jsToken) jsToken = findBetween(html, 'jsToken=', '&');
  if (!jsToken) jsToken = extractTokenFromScript(html, "jsToken");

  return jsToken;
}