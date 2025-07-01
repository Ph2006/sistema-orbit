#!/bin/bash
# Build script para debug no Netlify

echo "=== Netlify Build Debug ==="
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Current directory: $(pwd)"
echo "Files in current directory:"
ls -la

echo "=== Instalando dependências ==="
npm install

echo "=== Verificando dependências críticas ==="
npm list jspdf | head -5
npm list firebase | head -5
npm list next | head -5

echo "=== Executando build ==="
npm run build

echo "=== Build completo ==="
echo "Arquivos em .next:"
ls -la .next/ | head -10
