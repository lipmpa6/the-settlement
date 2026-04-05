const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "lipmpa6";
const REPO_NAME = "the-settlement-data";
const FILE_PATH = "data.json";

async function getFile() {
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" }
  });
  const json = await res.json();
  const content = JSON.parse(Buffer.from(json.content, "base64").toString("utf8"));
  return { content, sha: json.sha };
}

async function saveFile(content, sha) {
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
    method: "PUT",
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Update data",
      content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
      sha
    })
  });
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const { content } = await getFile();
      return res.status(200).json(content);
    }

    if (req.method === "POST") {
      const { action, payload } = req.body;
      const { content, sha } = await getFile();

      if (action === "addUser") {
        if (!content.users.includes(payload.name)) {
          content.users.push(payload.name);
        }
      }

      if (action === "createWager") {
        const wager = {
          id: Date.now().toString(),
          title: payload.title,
          description: payload.description || "",
          amount: payload.amount,
          outcomes: payload.outcomes,
          createdBy: payload.createdBy,
          createdAt: new Date().toISOString(),
          status: "open",
          bets: [{ name: payload.createdBy, outcome: payload.creatorOutcome, changedCount: 0, placedAt: new Date().toISOString() }],
          closedBy: null,
          closedAt: null,
          winningOutcome: null,
          paidOutBy: null,
          paidOutAt: null,
          voidedBy: null,
          voidedAt: null
        };
        content.wagers.push(wager);
      }

      if (action === "joinWager") {
        const wager = content.wagers.find(w => w.id === payload.wagerId);
        if (wager && wager.status === "open") {
          const existing = wager.bets.find(b => b.name === payload.name);
          if (existing) {
            existing.outcome = payload.outcome;
            existing.changedCount = (existing.changedCount || 0) + 1;
          } else {
            wager.bets.push({ name: payload.name, outcome: payload.outcome, changedCount: 0, placedAt: new Date().toISOString() });
          }
        }
      }

      if (action === "closeWager") {
        const wager = content.wagers.find(w => w.id === payload.wagerId);
        if (wager && wager.status === "open") {
          wager.status = "closed";
          wager.winningOutcome = payload.winningOutcome;
          wager.closedBy = payload.closedBy;
          wager.closedAt = new Date().toISOString();
        }
      }

      if (action === "payoutWager") {
        const wager = content.wagers.find(w => w.id === payload.wagerId);
        if (wager && wager.status === "closed") {
          wager.status = "paidout";
          wager.paidOutBy = payload.paidOutBy;
          wager.paidOutAt = new Date().toISOString();
        }
      }

      if (action === "voidWager") {
        const wager = content.wagers.find(w => w.id === payload.wagerId);
        if (wager && wager.status === "open") {
          wager.status = "void";
          wager.voidedBy = payload.voidedBy;
          wager.voidedAt = new Date().toISOString();
        }
      }

      await saveFile(content, sha);
      return res.status(200).json({ success: true, data: content });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
