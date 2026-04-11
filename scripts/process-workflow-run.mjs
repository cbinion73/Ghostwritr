const [, , runId, workerUrl, internalToken] = process.argv;

if (!runId || !workerUrl) {
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

try {
  let response = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(internalToken
            ? {
                "x-internal-workflow-token": internalToken,
              }
            : {}),
        },
        body: JSON.stringify({ runId }),
      });

      if (response.ok) {
        break;
      }
    } catch {
      response = null;
    }

    await sleep(400 * attempt);
  }

  if (!response?.ok) {
    process.exit(1);
  }
} catch {
  process.exit(1);
}
