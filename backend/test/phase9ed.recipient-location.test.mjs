import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/stockTransfers.routes.js",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("../../frontend/src/pages/StockTransferTasks.tsx",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../frontend/src/api/client.ts",import.meta.url),"utf8");

test("recipient location options are destination-branch and authorization scoped",()=>{
  assert.match(route,/receiving-locations/);
  assert.match(route,/is_active AND l\.is_stock_holding/);
  assert.match(route,/sec\.user_location/);
  assert.match(route,/destination_branch_id/);
});

test("capability permits an alternate authorized location instead of requiring the preferred location",()=>{
  assert.match(route,/authorized_receiving_location_count/);
  assert.match(route,/You do not have access to any active stock-holding location in this branch/);
  assert.match(route,/can_receive/);
});

test("receiving UI selects and submits the actual receiving location",()=>{
  assert.match(page,/Receive Into Location/);
  assert.match(page,/getStockTransferReceivingLocations/);
  assert.match(page,/receiving_location_id/);
  assert.match(client,/receiving-locations/);
  assert.match(page,/Received Into|destination_location_name/);
});

test("incoming receipt detail exposes the canonical Receive Stock action",()=>{
  assert.match(page,/Review dispatched stock and receive outstanding quantities/);
  assert.match(page,/Receive Stock/);
  assert.match(page,/Receipt unavailable/);
  assert.doesNotMatch(page,/No receipt is posted from this view/);
  assert.match(client,/dispatches\/\$\{encode\(id\)\}\/receive-capability/);
  assert.doesNotMatch(client,/dispatches\/\$\{encode\(id\)\}\/capability/);
});

test("canonical receipt handler initializes the selected location before validation",()=>{
  const handler=route.slice(route.indexOf('router.post("/dispatches/:id/receive"'));
  assert.equal((handler.match(/const receivingLocationId/g)||[]).length,1);
  const declaration=handler.indexOf("const receivingLocationId");
  const firstUse=handler.indexOf("[receivingLocationId");
  assert.notEqual(declaration,-1);
  assert.notEqual(firstUse,-1);
  assert.ok(declaration<firstUse);
  assert.match(handler,/receiving_location_id\|\|req\.body\?\.destination_location_id\|\|\"\"/);
  assert.doesNotMatch(handler,/Cannot access ['"]receivingLocationId/);
});

test("preferred receiving location is shown once while the selector remains explicit",()=>{
  assert.equal((page.match(/Preferred Receiving Location:/g)||[]).length,1);
  assert.equal((page.match(/<span>Receive Into Location<\/span>/g)||[]).length,1);
});

test("receipt reconciliation keeps movement scope and request progress distinct",()=>{
  const inventoryReports=fs.readFileSync(new URL("../src/routes/inventoryReports.routes.js",import.meta.url),"utf8");
  const requests=fs.readFileSync(new URL("../src/routes/internalStockRequests.routes.js",import.meta.url),"utf8");
  assert.match(inventoryReports,/from_loc\.branch_id=\$1 OR to_loc\.branch_id=\$1/);
  assert.match(inventoryReports,/movement_type/);
  assert.match(requests,/GREATEST\(rl\.approved_qty-COALESCE\(dx\.qty_dispatched,0\),0\) AS outstanding_qty/);
  assert.match(requests,/AS dispatched_qty/);
  assert.match(requests,/Math\.max\(0, Number\(l\.approved_qty\)\s*-\s*Number\(l\.dispatched_qty \|\| 0\)\)/);
  assert.match(page,/\[selectedDispatchId\]/);
  assert.match(page,/outstanding_qty/);
});

test("D7 workbench UX preserves interactive task views and receipt safety",()=>{
  const requests=fs.readFileSync(new URL("../../frontend/src/pages/InternalStockRequests.tsx",import.meta.url),"utf8");
  assert.match(page,/selectedTaskView/);
  assert.match(page,/cursor-pointer border-2 transition/);
  assert.match(page,/selectedTaskView==="incoming_receipts"/);
  assert.match(page,/receive\.isPending\?"Posting\.\.\.":"Post Receipt"/);
  assert.match(page,/Receipt \$\{result\?\.data\?\.receipt_no/);
  assert.match(requests,/useState\("0"\)/);
  assert.match(requests,/Requested quantity must be greater than zero/);
  assert.match(requests,/Preferred Receiving Location/);
  assert.match(requests,/Optional preferred destination/);
});
