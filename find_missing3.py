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
                    has_auth = False
                    for arg in node.args.args + node.args.kwonlyargs:
                        if isinstance(arg.default, ast.Call) and getattr(arg.default.func, 'id', '') == 'Depends':
                            # Check what is inside Depends
                            if arg.default.args:
                                depends_func = arg.default.args[0]
                                if getattr(depends_func, 'id', '') in ['get_current_user', 'get_current_staff_user', 'get_current_professor_user', '_require_internal_secret', 'require_professor_active_offering']:
                                    has_auth = True
                    if not has_auth:
                        print(f"File: {filename}, Route: {node.name}")

find_unprotected_routes('c:/Users/ilyas/Desktop/kresco mvp v2/backend/app/routers')
