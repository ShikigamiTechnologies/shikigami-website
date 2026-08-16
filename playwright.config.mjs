import { defineConfig } from "@playwright/test";
const pilot=process.argv.some(x=>x.includes("cypher-batch-d-pilot"));
export default defineConfig({ testDir:"./tests/browser", timeout:60000, workers:1, use:{baseURL:"http://127.0.0.1:8787",trace:"retain-on-failure"}, webServer:{command:pilot?"node scripts/cypher-pilot-worker-server.mjs":"node scripts/cypher-static-test-server.mjs",url:`http://127.0.0.1:8787/${pilot?"cypher-pilot.html":"cypher-sign-in.html"}`,reuseExistingServer:false,timeout:30000} });
