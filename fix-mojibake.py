#!/usr/bin/env python3
"""
Corrige mojibake causado por texto UTF-8 lido/salvo como Latin-1 (cp1252).
Uso:
    python3 fix-mojibake.py caminho/para/arquivo.tsx
    python3 fix-mojibake.py caminho/para/pasta   (corrige todos os .tsx/.ts dentro, recursivamente)

Sempre faz backup do arquivo original com sufixo .bak antes de sobrescrever.
"""

import sys
import os

def fix_text(text: str) -> str:
    """
    Tenta reverter uma camada de mojibake: se o texto contém sequências
    típicas de UTF-8 mal interpretado como Latin-1 (ex: 'Ã§', 'Ã£', 'Ã©'),
    reencoda como Latin-1 e decodifica como UTF-8.
    Aplica repetidamente até não haver mais mudança (corrige múltiplas camadas)
    ou até não ser mais seguro continuar.
    """
    previous = None
    current = text
    attempts = 0
    while current != previous and attempts < 5:
        previous = current
        try:
            candidate = current.encode('latin1').decode('utf-8')
        except (UnicodeDecodeError, UnicodeEncodeError):
            break
        # Heurística: só aceita a correção se ela reduzir a quantidade de
        # sequências suspeitas típicas de mojibake (Ã, Â seguidos de outro char)
        suspicious_before = current.count('Ã') + current.count('Â') + current.count('â€')
        suspicious_after = candidate.count('Ã') + candidate.count('Â') + candidate.count('â€')
        if suspicious_after < suspicious_before:
            current = candidate
            attempts += 1
        else:
            break
    return current


def process_file(path: str) -> bool:
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        original = f.read()

    fixed = fix_text(original)

    if fixed == original:
        print(f"  (sem alterações) {path}")
        return False

    backup_path = path + '.bak'
    with open(backup_path, 'w', encoding='utf-8') as f:
        f.write(original)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(fixed)

    print(f"  CORRIGIDO: {path}  (backup salvo em {backup_path})")
    return True


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    target = sys.argv[1]
    extensions = ('.ts', '.tsx', '.js', '.jsx')

    if os.path.isfile(target):
        process_file(target)
    elif os.path.isdir(target):
        changed = 0
        for root, _, files in os.walk(target):
            if 'node_modules' in root or '.git' in root:
                continue
            for name in files:
                if name.endswith(extensions):
                    full_path = os.path.join(root, name)
                    if process_file(full_path):
                        changed += 1
        print(f"\nTotal de arquivos corrigidos: {changed}")
    else:
        print(f"Caminho não encontrado: {target}")
        sys.exit(1)


if __name__ == '__main__':
    main()
