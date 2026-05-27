import ast
from pathlib import Path

def check_file(path):
    with open(path, "r", encoding="utf-8") as f:
        tree = ast.parse(f.read(), filename=str(path))
    
    for node in ast.walk(tree):
        if isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
            for child in ast.walk(node):
                if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                    if child.func.attr == "execute" and getattr(child.func.value, "id", "") == "db":
                        print(f"N+1 found in {path.name} at line {child.lineno}")

for p in Path(r"c:\Users\ilyas\Desktop\kresco mvp v2\backend\app").rglob("*.py"):
    try:
        check_file(p)
    except Exception as e:
        pass
