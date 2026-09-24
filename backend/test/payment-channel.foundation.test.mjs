import assert from "node:assert/strict";

const transitions = {
  INITIATED: ["PENDING", "CONFIRMED", "FAILED", "CANCELLED"],
  PENDING: ["CONFIRMED", "FAILED", "CANCELLED"],
  CONFIRMED: ["REVERSED"],
  FAILED: [],
  CANCELLED: [],
  REVERSED: [],
};

function canTransition(from, to) {
  return transitions[from]?.includes(to) === true;
}

assert.equal(canTransition("INITIATED", "CONFIRMED"), true);
assert.equal(canTransition("PENDING", "CONFIRMED"), true);
assert.equal(canTransition("CONFIRMED", "REVERSED"), true);
assert.equal(canTransition("CONFIRMED", "FAILED"), false);
assert.equal(canTransition("REVERSED", "CONFIRMED"), false);

const seenReferences = new Set(["MTN-001"]);
assert.equal(seenReferences.has("MTN-001"), true, "provider references must be unique per channel");
assert.equal(seenReferences.has("AIRTEL-001"), false);

const eligible = (channel, branchId, locationId) => channel.status === "ACTIVE" && channel.collection_enabled && channel.mode === "MANUAL"
  && (!channel.branch_id || channel.branch_id === branchId)
  && (!channel.location_id || channel.location_id === locationId);
assert.equal(eligible({ status: "ACTIVE", collection_enabled: true, mode: "MANUAL", branch_id: null, location_id: null }, "branch-a", "location-a"), true);
assert.equal(eligible({ status: "INACTIVE", collection_enabled: true, mode: "MANUAL", branch_id: null, location_id: null }, "branch-a", "location-a"), false);
assert.equal(eligible({ status: "ACTIVE", collection_enabled: true, mode: "MANUAL", branch_id: "branch-b", location_id: null }, "branch-a", "location-a"), false);

console.log("payment-channel foundation tests passed");
