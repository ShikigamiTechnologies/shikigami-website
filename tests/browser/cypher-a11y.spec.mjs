import { test,expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for(const device of [{name:"desktop",width:1440,height:900},{name:"tablet",width:834,height:1112},{name:"mobile",width:390,height:844}]) test(`${device.name} keyboard, focus, labels, errors and contrast`,async({page})=>{
  await page.setViewportSize(device); await page.goto("/cypher-sign-in.html");
  await expect(page.locator("main")).toBeVisible(); const controls=page.locator("input,button,a"); expect(await controls.count()).toBeGreaterThan(0);
  await page.keyboard.press("Tab"); await expect(page.locator(":focus")).toBeVisible();
  const required=page.locator("input[required]:visible").first(); if(await required.count()){await required.focus(); await required.fill(""); expect(await required.evaluate(input=>input.validity.valueMissing)).toBe(true); expect(await required.evaluate(input=>Boolean(input.labels?.length||input.getAttribute("aria-label")||input.getAttribute("aria-labelledby")))).toBe(true);}
  const results=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
  expect(results.violations,JSON.stringify(results.violations,null,2)).toEqual([]);
});
