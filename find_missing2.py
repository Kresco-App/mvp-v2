import ast
import glob
import sys

def find_unprotected_routes(directory):
    for filename in glob.glob(directory + '/**/*.py', recursive=True):
        with open(filename, 'r', encoding='utf-8') as f:
            content = f.read()
        try:
            tree = ast.parse(content)
        except SyntaxError:
            continue
            
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                is_route = False
                for dec in node.decorator_list:
                    if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
                        if getattr(dec.func.value, 'id', '') == 'router':
                            is_route = True
                            break
                if is_route:
                    has_depends = False
                    for arg in node.args.args + node.args.kwonlyargs:
                        if isinstance(arg.default, ast.Call) and isinstance(arg.default.func, ast.Name):
                            if arg.default.func.id == 'Depends':
                                has_depends = True
                    if not has_depends:
                        print(f"File: {filename}, Route: {node.name}")

find_unprotected_routes('c:/Users/ilyas/Desktop/kresco mvp v2/backend/app/routers')
