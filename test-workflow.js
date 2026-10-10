
const BASE = "http://localhost:3002";
const PASSWORD = "TestPass123!";


async function request(path, method = "GET", token, body) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();

  console.log(`${method} ${path} -> ${response.status}`);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Expected JSON from ${method} ${path}, but received HTTP ${response.status}.\n` +
      `Content-Type: ${response.headers.get("content-type")}\n` +
      `Response preview: ${text.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed: ${JSON.stringify(data)}`
    );
  }

  return data;
}


async function registerAndLogin(name, email) {
  const registration = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  });

  if (registration.status !== 201 && registration.status !== 409) {
    throw new Error(await registration.text());
  }

  const result = await request("/api/auth/login", "POST", null, {
    email,
    password: PASSWORD,
  });

  return result.token;
}

async function main() {
  // Use separate accounts for reporting, claiming, and staff duties.
  const suffix = Date.now();

  const reporterToken = await registerAndLogin(
    "Found Item Reporter",
    `reporter${suffix}@example.com`
  );

  const claimantToken = await registerAndLogin(
    "Item Claimant",
    `claimant${suffix}@example.com`
  );

  // The existing test account must have role = 'admin'.
  const staffLogin = await request("/api/auth/login", "POST", null, {
    email: "student@example.com",
    password: PASSWORD,
  });

  const staffToken = staffLogin.token;

  if (staffLogin.user.role !== "admin") {
    throw new Error("Staff account is not an admin");
  }

  // 1. Student reports an item they found.
  const created = await request(
    "/api/items",
    "POST",
    reporterToken,
    {
      type: "found",
      title: `Found Wallet ${suffix}`,
      description: "Wallet found near the college library",
      category: "Accessories",
      location: "College Library",
      item_date: "2026-10-10",
    }
  );

  const itemId = created.item.id;

  if (created.item.custody_status !== "pending_handover") {
    throw new Error("Found item should await desk handover");
  }

  // 2. Staff confirms the physical item was received.
  await request(
    `/api/items/${itemId}/receive`,
    "PATCH",
    staffToken,
    {}
  );

  // 3. A different student submits a claim.
  const submitted = await request(
    `/api/items/${itemId}/claims`,
    "POST",
    claimantToken,
    {
      message: "I believe this is my wallet. I can identify its contents.",
    }
  );

  const claimId = submitted.claim.id;

  // 4. Staff reviews the claim.
  await request(
    `/api/items/${itemId}/claims`,
    "GET",
    staffToken
  );

  // 5. Staff approves the claim.
  await request(
    `/api/claims/${claimId}`,
    "PATCH",
    staffToken,
    { decision: "approved" }
  );

  // 6. Staff records the physical handover.
  const completed = await request(
    `/api/claims/${claimId}/complete`,
    "PATCH",
    staffToken,
    {}
  );

  console.log("\nFINAL RESULT");
  console.log({
    itemId,
    claimId,
    itemStatus: completed.status,
    custodyStatus: completed.custody_status,
    claimStatus: completed.claim_status,
  });

  if (
    completed.status !== "resolved" ||
    completed.custody_status !== "released" ||
    completed.claim_status !== "completed"
  ) {
    throw new Error("Final workflow status is incorrect");
  }

  console.log("\nPASS: Complete recovery workflow succeeded.");
}

main().catch((error) => {
  console.error("\nWORKFLOW TEST FAILED:", error.message);
  process.exitCode = 1;
});
