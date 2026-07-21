/**
 * Auto-detects and starts the webapp in the directory specified by
 * npm_package_config_webappDir (set in package.json config.webappDir).
 *
 * Detection priority:
 *   1. Python Flask app  → any .py file containing `if __name__ == "__main__"`
 *   2. Node app          → directory has a package.json with a "start" script
 *   3. Static files      → served via serve_static.js on port 3001
 */

import { spawn } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webappDir = process.env.npm_package_config_webappDir || 'webapp';
const webappPath = join(__dirname, webappDir);

if (!existsSync(webappPath)) {
    console.error(`[run_webapp] Directory not found: ${webappPath}`);
    process.exit(1);
}

function findPythonMain(dir) {
    const files = readdirSync(dir).filter(f => f.endsWith('.py'));
    // Prefer conventional names first
    const preferred = ['app.py', 'main.py', 'wsgi.py'];
    for (const name of preferred) {
        if (files.includes(name)) return name;
    }
    // Look for Flask/Dash entry points and rank by route count — main app wins
    const runPatterns = [/server\.run\s*\(/, /app\.run\s*\(/];
    const candidates = [];
    for (const name of files) {
        const src = readFileSync(join(dir, name), 'utf8');
        const hasMain = src.includes('if __name__ == "__main__"') || src.includes("if __name__ == '__main__'");
        if (hasMain && runPatterns.some(p => p.test(src))) {
            const routeCount = (src.match(/@(server|app)\.route/g) || []).length;
            candidates.push({ name, routeCount });
        }
    }
    if (candidates.length > 0) {
        candidates.sort((a, b) => b.routeCount - a.routeCount);
        return candidates[0].name;
    }
    // Last resort: any .py with an entry point guard
    for (const name of files) {
        const src = readFileSync(join(dir, name), 'utf8');
        if (src.includes('if __name__ == "__main__"') || src.includes("if __name__ == '__main__'")) {
            return name;
        }
    }
    return null;
}

function run(cmd, args, opts = {}) {
    const proc = spawn(cmd, args, { stdio: 'inherit', ...opts });
    proc.on('exit', code => process.exit(code ?? 0));
    return proc;
}

const pythonMain = findPythonMain(webappPath);

if (pythonMain) {
    console.log(`[run_webapp] Detected Python app → python3 ${pythonMain} (in ${webappDir}/)`);
    run('python3', [pythonMain], { cwd: webappPath });

} else if (existsSync(join(webappPath, 'package.json'))) {
    const pkg = JSON.parse(readFileSync(join(webappPath, 'package.json'), 'utf8'));
    if (pkg.scripts?.start) {
        console.log(`[run_webapp] Detected Node app → npm start (in ${webappDir}/)`);
        run('npm', ['start'], { cwd: webappPath });
    } else {
        console.log(`[run_webapp] No start script — serving ${webappDir}/ statically on :3001`);
        run('node', [join(__dirname, 'serve_static.js'), webappDir, '3001']);
    }

} else {
    console.log(`[run_webapp] No framework detected — serving ${webappDir}/ statically on :3001`);
    run('node', [join(__dirname, 'serve_static.js'), webappDir, '3001']);
}
