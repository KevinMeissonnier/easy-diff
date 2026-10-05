'use strict';

// The skill's entry point. The plugin ships TypeScript that Node runs as is (type stripping,
// Node >= 22.18), so an older Node fails on the `.ts` extension before any of our code runs.
// This file stays plain CommonJS so it can still load there and say what is wrong.
if (!process.features.typescript) {
  console.error(
    `error: easy-diff needs Node.js >= 22.18, which runs TypeScript natively, but found ` +
      `${process.version}. Upgrade Node (e.g. \`nvm install 24\` or \`brew install node\`) ` +
      'and run /easy-diff:review again.'
  );
  process.exit(1);
}

import('./cli.ts');
