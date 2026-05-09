import os
from openapi_spec_validator import validate_spec
from openapi_spec_validator.readers import read_from_filename

def validate_openapi_specs(directory):
    """
    Iterates through YAML files in the specified directory and validates them
    against the OpenAPI 3.0.0 standard.
    """
    print(f"Starting OpenAPI Validation for: {directory}\n")
    
    if not os.path.exists(directory):
        print(f"Error: Directory {directory} does not exist.")
        return

    files = [f for f in os.listdir(directory) if f.endswith(('.yaml', '.yml'))]
    
    passed_count = 0
    for filename in files:
        file_path = os.path.join(directory, filename)
        print(f"Checking {filename}...")
        
        try:
            spec_dict, _ = read_from_filename(file_path)
            validate_spec(spec_dict)
            print("  [PASS] Valid OpenAPI 3.0 spec.\n")
            passed_count += 1
        except Exception as e:
            print(f"  [FAIL] Invalid specification.")
            print(f"  Reason: {e}\n")

    print(f"Validation Complete: {passed_count}/{len(files)} files passed.")

if __name__ == "__main__":
    # Locate the specs directory relative to the project root
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    specs_path = os.path.join(base_dir, 'mcp', 'openapi-specs')
    validate_openapi_specs(specs_path)