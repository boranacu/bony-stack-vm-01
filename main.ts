import { mkdirSync as md, readdirSync as rd, readFileSync as rf, writeFileSync as wf } from 'node:fs';
import { join } from 'node:path';

const enc = new TextEncoder();

function run(p: Uint8Array, inp: Uint8Array) {
  const n = p.length, D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256), out = new Uint8Array(65536);
  let sp = 0, csp = 0, olen = 0, inPos = 0, pc = 0, steps = 0;
  const done = (exit: number) => ({ stdout: out.subarray(0, olen), exit });

  for (;;) {
    if (steps === 1e6) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = p[pc];
    const imm = op === 2 ? 4 : op === 1 ? 1 : op >= 0x30 && op <= 0x33 ? 2 : 0;
    const isBin = op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b && op !== 0x1f;
    const valid = isBin || op <= 7 || op === 0x17 || op === 0x1b || (op >= 0x30 && op <= 0x34) || op === 0x40 || op === 0x41 || (op >= 0x50 && op <= 0x53);
    if (!valid) return done(5);
    if (pc + imm >= n) return done(9);
    steps++;
    const next = pc + 1 + imm;
    const pops = isBin || op === 5 || op === 6 || op === 0x41 ? 2 : op === 7 ? 3 : op === 3 || op === 4 || op === 0x17 || op === 0x1b || op === 0x31 || op === 0x32 || op === 0x40 || op >= 0x50 && op !== 0x52 ? 1 : 0;
    const pushes = op === 1 || op === 2 || op === 4 || op === 6 || op === 0x52 ? 1 : 0;
    const pushNet = op === 4 || op === 6 ? 1 : op === 1 || op === 2 || op === 0x52 ? 1 : 0;
    if (sp < pops) return done(2);
    if (sp + pushNet > 256) return done(3);
    pc = next;

    if (isBin) {
      const b = D[--sp], a = D[--sp];
      let r = 0;
      if (op === 0x10) r = (a + b) | 0;
      else if (op === 0x11) r = (a - b) | 0;
      else if (op === 0x12) r = Math.imul(a, b);
      else if (op < 0x17) {
        if (b === 0) return done(4);
        if (op === 0x13) r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        else if (op === 0x14) r = b === -1 ? 0 : (a % b) | 0;
        else if (op === 0x15) r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        else r = ((a >>> 0) % (b >>> 0)) | 0;
      } else if (op === 0x18) r = a & b;
      else if (op === 0x19) r = a | b;
      else if (op === 0x1a) r = a ^ b;
      else if (op === 0x1c) r = a << (b & 31);
      else if (op === 0x1d) r = a >> (b & 31);
      else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
      else if (op === 0x20) r = a === b ? 1 : 0;
      else if (op === 0x21) r = a < b ? 1 : 0;
      else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      D[sp++] = r;
    } else if (op === 0) return done(0);
    else if (op === 1) D[sp++] = (p[next - 1] << 24) >> 24;
    else if (op === 2) D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24);
    else if (op === 3) sp--;
    else if (op === 4) { D[sp] = D[sp - 1]; sp++; }
    else if (op === 5) { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; }
    else if (op === 6) { D[sp] = D[sp - 2]; sp++; }
    else if (op === 7) { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; }
    else if (op === 0x17) D[sp - 1] = -D[sp - 1] | 0;
    else if (op === 0x1b) D[sp - 1] = ~D[sp - 1];
    else if (op <= 0x32) {
      const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
      if (op === 0x30 || (op === 0x31 ? D[--sp] === 0 : D[--sp] !== 0)) pc = next + rel;
    } else if (op === 0x33) {
      if (csp === 64) return done(7);
      C[csp++] = next;
      pc = p[next - 2] | (p[next - 1] << 8);
    } else if (op === 0x34) {
      if (csp === 0) return done(8);
      pc = C[--csp];
    } else if (op === 0x40) {
      const a = D[sp - 1];
      if (a < 0 || a >= 256) return done(6);
      D[sp - 1] = M[a];
    } else if (op === 0x41) {
      const a = D[sp - 1], v = D[sp - 2];
      if (a < 0 || a >= 256) return done(6);
      sp -= 2; M[a] = v;
    } else if (op === 0x50) {
      const b = enc.encode(String(D[--sp]));
      if (olen + b.length > 65536) return done(11);
      out.set(b, olen); olen += b.length;
    } else if (op === 0x51) {
      if (olen >= 65536) return done(11);
      out[olen++] = D[--sp] & 255;
    } else if (op === 0x52) D[sp++] = inPos < inp.length ? inp[inPos++] : -1;
    else return done(D[--sp] & 255);
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input', O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of rd(I).sort()) {
  const r = run(new Uint8Array(rf(join(I, id, 'program.bin'))), new Uint8Array(rf(join(I, id, 'input.bin'))));
  md(join(O, id), { recursive: true });
  wf(join(O, id, 'stdout.bin'), r.stdout);
  wf(join(O, id, 'exit.txt'), `${r.exit}\n`);
}
