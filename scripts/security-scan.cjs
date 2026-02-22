#!/usr/bin/env node

const { execSync } = require('child_process');

const checks = [
  {
    name: 'Potential JWT/private key material in tracked files',
    cmd: "git grep -n -I -E 'eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----' HEAD -- . ':!dist' ':!node_modules' ':!.env'",
    allow: [/^\.env\.example:/],
  },
  {
    name: 'Hardcoded Supabase keys in tracked files',
    cmd: "git grep -n -I -E 'VITE_SUPABASE_(ANON|SERVICE_ROLE)_KEY\\s*=\\s*.+|SUPABASE_(ANON|SERVICE_ROLE)_KEY\\s*=\\s*.+' HEAD -- . ':!dist' ':!node_modules' ':!.env'",
    allow: [/^\.env\.example:VITE_SUPABASE_ANON_KEY=$/],
  },
  {
    name: 'Service role mentions in app code',
    cmd: "git grep -n -I -E 'service_role|SERVICE_ROLE' HEAD -- . ':!dist' ':!node_modules'",
    allow: [
      /^scripts\/security-scan\.cjs:/,
      /^SECURITY_HARDENING\.md:/,
      /^RELEASE_CHECKLIST\.md:/,
    ],
  },
];

let hasFindings = false;

for (const check of checks) {
  let raw = '';
  try {
    raw = execSync(check.cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    raw = (error.stdout || '').toString().trim();
  }

  if (!raw) {
    console.log(`PASS: ${check.name}`);
    continue;
  }

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !check.allow.some((pattern) => pattern.test(line)));

  if (!lines.length) {
    console.log(`PASS: ${check.name}`);
    continue;
  }

  hasFindings = true;
  console.log(`FAIL: ${check.name}`);
  lines.forEach((line) => console.log(`  ${line}`));
}

if (hasFindings) {
  console.error('SECURITY SCAN: FAIL');
  process.exit(1);
}

console.log('SECURITY SCAN: PASS');
