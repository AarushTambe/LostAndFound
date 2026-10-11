
const BASE = process.env.TEST_BASE_URL || "http://localhost:3002";
const PASSWORD = "TestPass123!";
const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL || "student@example.com";
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD || PASSWORD;

let passed = 0;

async function request(path, method = "GET", token, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `${method} ${path}: expected JSON, received ${response.status}`
    );
  }

  return { status: response.status, data };
}

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed++;
  console.log(`PASS: ${message}`);
}

async function expectStatus(path, method, token, body, expected, label) {
  const result = await request(path, method, token, body);

  check(
    result.status === expected,
    `${label} — expected ${expected}, received ${result.status}`
  );

  return result.data;
}

async function registerAndLogin(name, suffix) {
  const email = `${name.toLowerCase().replace(/\s+/g, ".")}.${suffix}@example.com`;

  const registration = await request("/api/auth/register", "POST", null, {
    name,
    email,
    password: PASSWORD,
  });

  if (![201, 409].includes(registration.status)) {
    throw new Error(`Registration failed: ${JSON.stringify(registration.data)}`);
  }

  const login = await request("/api/auth/login", "POST", null, {
    email,
    password: PASSWORD,
  });

  if (login.status !== 200 || !login.data.token) {
    throw new Error(`Login failed: ${JSON.stringify(login.data)}`);
  }

  return login.data.token;
}

async function main() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const reporter = await registerAndLogin("Edge Reporter", suffix);
  const claimant1 = await registerAndLogin("Edge Claimant One", suffix);
  const claimant2 = await registerAndLogin("Edge Claimant Two", suffix);

  const staffLogin = await request("/api/auth/login", "POST", null, {
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
  });

  if (
    staffLogin.status !== 200 ||
    !staffLogin.data.token ||
    staffLogin.data.user?.role !== "admin"
  ) {
    throw new Error(
      "Staff login failed. Check TEST_STAFF_EMAIL, TEST_STAFF_PASSWORD, and the admin role."
    );
  }

  const staff = staffLogin.data.token;

  // Create a found report.
  const created = await request("/api/items", "POST", reporter, {
    type: "found",
    title: `Edge Case Wallet ${suffix}`,
    description: "Wallet for edge-case testing",
    category: "Accessories",
    location: "College Library",
    item_date: "2026-10-11",
  });

  if (created.status !== 201 || !created.data.item?.id) {
    throw new Error(`Item creation failed: ${JSON.stringify(created.data)}`);
  }

  const itemId = created.data.item.id;

  // Students cannot perform staff-only operations.
  await expectStatus(
    `/api/items/${itemId}/receive`,
    "PATCH",
    claimant1,
    {},
    403,
    "Student cannot confirm physical receipt"
  );

  await expectStatus(
    `/api/items/${itemId}/claims`,
    "GET",
    claimant1,
    undefined,
    403,
    "Student cannot view all claims"
  );

  // A report cannot be claimed before staff receives it.
  await expectStatus(
    `/api/items/${itemId}/claims`,
    "POST",
    claimant1,
    { message: "I can identify the wallet" },
    409,
    "Claim before physical receipt is rejected"
  );

  // The reporter cannot claim their own found report.
  await expectStatus(
    `/api/items/${itemId}/claims`,
    "POST",
    reporter,
    { message: "This is my own report" },
    403,
    "Reporter cannot claim their own found report"
  );

  // Staff receives the item once.
  await expectStatus(
    `/api/items/${itemId}/receive`,
    "PATCH",
    staff,
    {},
    200,
    "Staff confirms physical receipt"
  );

  await expectStatus(
    `/api/items/${itemId}/receive`,
    "PATCH",
    staff,
    {},
    409,
    "Repeated receipt confirmation is rejected"
  );

  // Two different users may submit claims while the item is available.
  const claim1 = await request(
    `/api/items/${itemId}/claims`,
    "POST",
    claimant1,
    { message: "I can identify a unique mark on the wallet" }
  );

  check(claim1.status === 201, "First valid claim is accepted");

  const claimId1 = claim1.data.claim?.id;

  if (!claimId1) throw new Error("First claim ID missing");

  await expectStatus(
    `/api/items/${itemId}/claims`,
    "POST",
    claimant1,
    { message: "Submitting the same claim again" },
    409,
    "Duplicate claim by the same user is rejected"
  );

  const claim2 = await request(
    `/api/items/${itemId}/claims`,
    "POST",
    claimant2,
    { message: "I can identify the contents of this wallet" }
  );

  check(claim2.status === 201, "Second user's competing claim is accepted");

  const claimId2 = claim2.data.claim?.id;

  if (!claimId2) throw new Error("Second claim ID missing");

  // A student cannot approve claims.
  await expectStatus(
    `/api/claims/${claimId1}`,
    "PATCH",
    claimant1,
    { decision: "approved" },
    403,
    "Student cannot approve a claim"
  );

  // Invalid decisions must not alter claim state.
  await expectStatus(
    `/api/claims/${claimId1}`,
    "PATCH",
    staff,
    { decision: "maybe" },
    400,
    "Invalid claim decision is rejected"
  );

  // Approving one claim must reject the other pending claim.
  await expectStatus(
    `/api/claims/${claimId1}`,
    "PATCH",
    staff,
    { decision: "approved" },
    200,
    "Staff approves the first claim"
  );

  await expectStatus(
    `/api/claims/${claimId2}`,
    "PATCH",
    staff,
    { decision: "approved" },
    409,
    "Competing claim cannot also be approved"
  );

  // Only an approved claim can be completed.
  await expectStatus(
    `/api/claims/${claimId1}/complete`,
    "PATCH",
    staff,
    {},
    200,
    "Approved claim can be completed"
  );

  await expectStatus(
    `/api/claims/${claimId1}/complete`,
    "PATCH",
    staff,
    {},
    409,
    "Repeated handover completion is rejected"
  );

  console.log(`\nALL ${passed} EDGE-CASE CHECKS PASSED`);
}

main().catch((error) => {
  console.error("\nEDGE-CASE TEST FAILED:", error.message);
  process.exitCode = 1;
});
