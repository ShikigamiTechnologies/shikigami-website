import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',testMatch:'shirabe-integrated-lifecycle.spec.mjs',workers:1,timeout:60000,use:{baseURL:'http://127.0.0.1:8891',trace:'retain-on-failure'},webServer:{command:'node scripts/shirabe-lifecycle-test-server.mjs',url:'http://127.0.0.1:8891/shirabe.html',reuseExistingServer:false,timeout:30000}});
