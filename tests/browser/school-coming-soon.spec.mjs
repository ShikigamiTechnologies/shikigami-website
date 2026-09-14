import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.use({baseURL:'http://127.0.0.1:8791'});
for(const [width,height] of [[320,844],[390,844],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]) {
 for(const [path,lang] of [['/school','en'],['/es/school','es']]) test(`${lang} ${width} responsive, links, accessibility`,async({page})=>{
  await page.setViewportSize({width,height});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(path);await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('html')).toHaveAttribute('lang',lang);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('h1')).toHaveCount(1);await expect(page.locator('form,input,script,[download]')).toHaveCount(0);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  for(const href of await page.locator('a').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')))) {if(href.startsWith('#')) expect(await page.locator(href).count()).toBe(1);else expect((await page.request.get(href)).ok()).toBe(true);}
  expect(errors).toEqual([]);await page.screenshot({path:`reports/school/screenshots/${lang}-${width}.png`,fullPage:true});
 });
}
test('keyboard language navigation, skip link, reduced motion, no script',async({page,browser})=>{
 await page.goto('/school');await page.keyboard.press('Tab');await expect(page.locator('.skip')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused();
 await page.goto('/school');for(let i=0;i<4;i++)await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Español',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/es\/school$/);
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');expect(await page.evaluate(()=>document.getAnimations().length)).toBe(0);
 await page.screenshot({path:'reports/school/screenshots/es-reduced-motion.png',fullPage:true});
 const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:640,height:450}});const p=await context.newPage();await p.goto('http://127.0.0.1:8791/school');await expect(p.locator('h1')).toBeVisible();expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await context.close();
});
test('homepage School navigation and separate learning section',async({page})=>{
 await page.goto('/');await expect(page.locator('#home-nav-links a').filter({hasText:/^School$/})).toHaveCount(1);
 for(const width of [320,390,768,1024,1100,1366,1440,1920]){await page.setViewportSize({width,height:900});await page.goto('/');await page.emulateMedia({reducedMotion:'reduce'});if(width<=760)await page.locator('.home-nav-toggle').click();await expect(page.locator('#home-nav-links a[href="/school"]')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`reports/school/screenshots/home-${width}.png`,fullPage:true});}
 await expect(page.locator('#school')).toContainText('Invitations opening later');await expect(page.locator('#products #school')).toHaveCount(0);
});
