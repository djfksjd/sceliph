// Run with playwright-cli run-code --filename=scripts/plate-determinism-browser.js.
// Generate fixtures at outputs/plate-determinism-current first. Uses only actual
// UI declaration import, source saving, export and a fresh-session reload.
async page => {
  const base = 'http://127.0.0.1:4173', errors = [], rows = [];
  page.on('pageerror', e => errors.push(String(e)));
  for (let i = 0; i < 6; i++) {
    const id = `case-${i}`;
    await page.goto(base + '/?editor=elements');
    await page.getByText('Load / export', {exact: true}).click();
    await page.getByLabel('Load source / Domain declaration JSON').setInputFiles(`outputs/plate-determinism-current/${id}.declaration.json`);
    await page.getByRole('button', {name: 'Centered plate with declared through bore', exact: true}).waitFor();
    const saved = page.waitForEvent('download');
    await page.getByRole('button', {name: 'Save project JSON', exact: true}).click();
    await (await saved).saveAs(`output/playwright/plate-determinism/current/${id}.source.json`);
    const asset = page.waitForEvent('download', {predicate: d => d.suggestedFilename() === 'morphloom-project.glb'});
    const source = page.waitForEvent('download', {predicate: d => d.suggestedFilename() === 'morphloom-source.json'});
    await page.getByRole('button', {name: 'Export project GLB + source JSON', exact: true}).click();
    await (await asset).saveAs(`output/playwright/plate-determinism/current/${id}.glb`);
    await (await source).saveAs(`output/playwright/plate-determinism/current/${id}.export-source.json`);
    // A new session must retain the exact same native source and exported GLB.
    await page.reload(); await page.getByText('Load / export', {exact: true}).click();
    await page.getByLabel('Load source / Domain declaration JSON').setInputFiles(`output/playwright/plate-determinism/current/${id}.source.json`);
    await page.getByRole('button', {name: 'Centered plate with declared through bore', exact: true}).waitFor();
    const again = page.waitForEvent('download', {predicate: d => d.suggestedFilename() === 'morphloom-project.glb'});
    await page.getByRole('button', {name: 'Export project GLB + source JSON', exact: true}).click();
    await (await again).saveAs(`output/playwright/plate-determinism/current/${id}.reopened.glb`);
    rows.push({id, declarationImported: true, sourceDownloaded: true, glbDownloaded: true, freshReopenExported: true});
  }
  if (errors.length) throw Error('Browser errors: ' + errors.join('; '));
  return {pass: true, cases: rows, pageErrors: errors, userAgent: await page.evaluate(() => navigator.userAgent)};
}
