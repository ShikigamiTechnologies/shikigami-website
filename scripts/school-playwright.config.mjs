import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({testDir:'../tests/browser',testMatch:'school-coming-soon.spec.mjs',workers:1,timeout:45000,reporter:'list',webServer:{cwd:fileURLToPath(new URL('..',import.meta.url)),command:'node scripts/school-preview-server.mjs',url:'http://127.0.0.1:8791/school',reuseExistingServer:true},use:{headless:true}});
