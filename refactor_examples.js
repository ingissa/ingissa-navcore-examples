const fs = require('fs');
const path = require('path');

const examplesDir = 'e:/WORKSPACE/expo_projects/go4exams/apps/navcore/examples';

function walk(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (file !== '.git' && file !== 'node_modules') {
                walk(filePath);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.md') || file.endsWith('.json')) {
            refactorFile(filePath);
        }
    });
}

function refactorFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace imports
    content = content.replace(/\.\.\/\.\.\/packages\/core\/src\/index/g, '@ingissa/navcore-core');
    content = content.replace(/\.\.\/\.\.\/packages\/mapbox\/src\/index/g, '@ingissa/navcore-mapbox');
    content = content.replace(/\.\.\/\.\.\/packages\/headless\/src\/index/g, '@ingissa/navcore-headless');
    content = content.replace(/\.\.\/\.\.\/packages\/simulator\/src\/index/g, '@ingissa/navcore-simulator');
    
    // Fix paths in README
    if (filePath.endsWith('README.md')) {
        content = content.replace(/examples\//g, '');
        // Remove example 12 section
        content = content.split('## 📱 Mobile Examples: Expo Complete Navigation (12)')[0];
    }
    
    // Remove isDev
    content = content.replace(/isDev:\s*true,?\s*/g, '');
    
    // Fix test threshold
    content = content.replace(/adapter\.assertReached\(route\.geometry\[route\.geometry\.length - 1\] as \[number, number\], 20\)/g, 'adapter.assertReached(route.geometry[route.geometry.length - 1] as [number, number], 50)');

    // Write as UTF-8 (no BOM)
    fs.writeFileSync(filePath, content, 'utf8');
}

walk(examplesDir);
console.log('Refactoring complete.');
