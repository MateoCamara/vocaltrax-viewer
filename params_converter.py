# converter.py
import json
import os
import argparse

def convert_format(source_data, config_name, steps=1):
    """
    Converts data from the VocalTrax format to the tract_config format for the GUI.
    
    Args:
        source_data (dict): The loaded JSON data from a params_pink_trombone.json file.
        config_name (str): The desired base name for the new configuration.
        steps (int): The number of steps for the configuration.
        
    Returns:
        dict: The data structured in the target tract_config format.
    """
    
    def _extend_array(arr, target_length, default_value):
        """Helper function to extend an array to a target length."""
        if not arr: arr = []
        if len(arr) >= target_length:
            return arr[:target_length]
        
        extended = arr[:]
        while len(extended) < target_length:
            extended.append(default_value)
        return extended

    # Extract source arrays safely, providing empty lists as fallback
    frequencies = source_data.get('frequencies', [])
    tenses = source_data.get('tenses', [])
    tongue_idx = source_data.get('physical', {}).get('tongue', {}).get('tongue_idx', [])
    tongue_diam = source_data.get('physical', {}).get('tongue', {}).get('tongue_diam', [])
    throat_constr = source_data.get('physical', {}).get('throatconstriction', {}).get('constr_val', [])
    lip_constr = source_data.get('physical', {}).get('lipconstriction', {}).get('constr_val', [])

    # Convert tenses (list of lists) to a flat voicenesses array
    voicenesses = [item[0] for item in tenses if isinstance(item, list) and item]

    # Determine the maximum length to synchronize all parameter arrays
    max_len = max(
        len(frequencies), len(voicenesses), len(tongue_idx), len(tongue_diam), 
        len(throat_constr), len(lip_constr)
    )

    # Build the target config dictionary with synchronized arrays
    target_config = {
        "name": config_name,
        "enabled": True,
        "config": {
            "steps": steps,
            "freqs": _extend_array(frequencies, max_len, 0.0),
            "voicenesses": _extend_array(voicenesses, max_len, 1.0),
            "tongue_indexes": _extend_array(tongue_idx, max_len, 20.0),
            "tongue_diams": _extend_array(tongue_diam, max_len, 2.5),
            "lip_diams": _extend_array(lip_constr, max_len, 1.0),
            "constriction_indexes": [12.0] * max_len, # Fixed value as per original logic
            "constriction_diams": _extend_array(throat_constr, max_len, 1.0)
        }
    }
    
    return target_config

def update_manifest(directory, new_filename):
    """
    Reads the manifest.json in a directory, adds a new filename if not
    present, sorts the list, and writes it back.
    
    Args:
        directory (str): The path to the directory containing the manifest.
        new_filename (str): The filename to add to the manifest.
    """
    manifest_path = os.path.join(directory, 'manifest.json')
    
    try:
        with open(manifest_path, 'r') as f:
            manifest_data = json.load(f)
        file_list = manifest_data.get('files', [])
    except (FileNotFoundError, json.JSONDecodeError):
        # If manifest doesn't exist or is invalid, start with an empty list
        file_list = []
        
    # Add the new file if it's not already in the list
    if new_filename not in file_list:
        file_list.append(new_filename)
        file_list.sort() # Keep the list alphabetically sorted
        
    # Write the updated manifest back to disk
    with open(manifest_path, 'w') as f:
        json.dump({"files": file_list}, f, indent=4)
    
    print(f"Successfully updated manifest at '{manifest_path}'")


def main():
    """
    Main function to parse command-line arguments and run the conversion process.
    """
    # Setup command-line argument parser
    parser = argparse.ArgumentParser(
        description="Convert VocalTrax params to tract_config format and update the UI manifest."
    )
    parser.add_argument(
        "input_file", 
        help="Path to the source 'params_pink_trombone.json' file.",
        default="params_pink_trombone",
    )
    parser.add_argument(
        "output_name", 
        help="The base name for the output config file (e.g., 'my_sound')."
    )
    args = parser.parse_args()

    # Define paths based on the script's location
    # Assumes `converter.py` is in the root, and configs are in `src/tract_configs`
    script_dir = os.path.dirname(os.path.abspath(__file__))
    configs_dir = os.path.join(script_dir, 'src', 'tract_configs')
    
    # Ensure the target directory exists
    os.makedirs(configs_dir, exist_ok=True)
    
    output_filename = f"{args.output_name}.json"
    output_filepath = os.path.join(configs_dir, output_filename)

    # --- Core Logic ---
    # 1. Read the source file
    print(f"Reading source file from '{args.input_file}'...")
    with open(args.input_file, 'r') as f:
        source_data = json.load(f)
        
    # 2. Convert the data to the target format
    print(f"Converting data with name '{args.output_name}'...")
    converted_data = convert_format(source_data, args.output_name)
    
    # 3. Save the new config file
    print(f"Saving new config to '{output_filepath}'...")
    with open(output_filepath, 'w') as f:
        json.dump(converted_data, f, indent=4)
        
    # 4. Update the manifest file
    print("Updating manifest...")
    update_manifest(configs_dir, output_filename)
    
    print("\nProcess completed successfully!")


if __name__ == "__main__":
    main()