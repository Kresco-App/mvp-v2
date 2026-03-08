import os
import re

directories = [
    '/Users/tahalyousfi/Desktop/kresco-v2/frontend/app',
    '/Users/tahalyousfi/Desktop/kresco-v2/frontend/components'
]

replacements = {
    'bg-white': 'bg-slate-900',
    'bg-slate-50': 'bg-slate-950',
    'text-slate-900': 'text-white',
    'text-slate-800': 'text-slate-200',
    'text-slate-700': 'text-slate-300',
    'text-slate-600': 'text-slate-400',
    'border-slate-100': 'border-slate-800',
    'border-slate-200': 'border-slate-700'
}

for d in directories:
    for root, dirs, files in os.walk(d):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.jsx'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r') as f:
                        content = f.read()

                    new_content = content
                    for old, new in replacements.items():
                        # We use regex to only match whole words
                        new_content = re.sub(rf'\b{old}\b', new, new_content)

                    if new_content != content:
                        with open(filepath, 'w') as f:
                            f.write(new_content)
                        print(f"Updated {filepath}")
                except Exception as e:
                    print(f"Error {filepath}: {e}")
