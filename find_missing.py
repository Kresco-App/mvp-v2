import os
import re

content = open('AGENT_BUG_DUMP.md', encoding='utf-8').read()
matches = re.findall(r'`([^`]+)`', content)

missing_files = []
for m in matches:
    if '/' in m and not m.startswith('http'):
        if '*' in m or '{' in m:
            continue
        if not os.path.exists(m):
            missing_files.append(m)

print("Missing:", set(missing_files))
