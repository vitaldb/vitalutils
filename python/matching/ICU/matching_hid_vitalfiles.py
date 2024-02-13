import pandas as pd
import os
import numpy as np
from datetime import datetime, timedelta
import vitaldb
import multiprocessing
from multiprocessing import Pool, cpu_count, freeze_support

pd.options.mode.chained_assignment = None  # 경고 메시지 무시

class MovementRefinement:

    def __init__(self, bedmove_filename, admission_filename, moves_filename):

        self.bedmove_filename = bedmove_filename
        self.admission_filename = admission_filename
        self.moves_filename = moves_filename
        self.dfbm = self.load_data('bedmove')
        self.dfadm = self.load_data('admission')

    def load_data(self, dtype):
        """
        Parameters:
        dtype: Type of data to load. 'bedmove' or 'admission'.

        Table Structures:
        - bedmove table (병상 이동 정보):
            - WD_DEPT_CD (str): ICU room code.
            - BED_NO (str): Bed number.
            - IN_DTM (datetime): Time of bed entry.
            - OUT_DTM (datetime): Time of bed exit.
            - Note: Data provided by 이지케어텍 API.

        - admission table (ICU 입퇴실 정보):
            - 환자번호 (str): Patient ID.
            - 입실병동 (str): ICU room code.
            - 입실시간 (datetime): Time of ICU admission.
            - 퇴실시간 (datetime): Time of ICU discharge.
            - Note: Admission times are from EMR.
        """
        print(f"[{datetime.now()}] Loading {dtype} data...")
        if dtype == 'bedmove':
            # Load bedmove data
            df = pd.read_csv(self.bedmove_filename, parse_dates=['bedin','bedout'], low_memory=False)        
            df.rename(columns={'WD_DEPT_CD' : 'icuroom', 'BED_NO' : 'bed', 'IN_DTM' : 'bedin', 'OUT_DTM' : 'bedout'}, inplace=True)
            df = df[['hid','icuroom','bed','bedin','bedout']].drop_duplicates()
        else:  
            # Load admission data
            df = pd.read_excel(self.admission_filename, parse_dates=['입실시간','퇴실시간'])
            df.rename(columns={'환자번호':'hid', '입실병동':'icuroom', '입실시간':'icuin', '퇴실시간':'icuout'}, inplace=True)
            df = df[['hid','icuroom','icuin','icuout']].drop_duplicates()
            ##############################################
            # Check for duplicates using 'hid' and 'icuout', and remove the extras
            copy_df = df.copy()
            df = copy_df[copy_df['icuout'].notna()].drop_duplicates(subset=['hid', 'icuout'], keep='last')

        return df


    def fill_missing_out_times(self, group, in_time, out_time):
        '''
        Accurately filling missing bedout/icuout times to minimize errors.
        - Missing bedout times are replaced with the next available bedin time, or if not available, with one day later than the last in_time.
        '''
        group = group.sort_values(by=['hid', in_time])

        # Flag rows with modified out_time to track changes
        group[out_time + '_modified'] = False
        group.loc[group[out_time].isna(), out_time + '_modified'] = True 
        # Fill missing out_time with the next in_time or, for the last entry, one day later than the last in_time
        group[out_time] = group[out_time].fillna(group[in_time].shift(-1))
        if pd.isna(group[out_time].iloc[-1]):
            group[out_time].iloc[-1] = group[in_time].iloc[-1] + timedelta(days=1)

        return group


    def fill_merge_data(self, num_processes):
        """
        Merges the admission data with the bed move data to create a comprehensive dataset.
        """
        print(f"[{datetime.now()}] Merging and filling data with {num_processes} processes...")

        with multiprocessing.Pool(processes=num_processes) as pool:
            # Use multiprocessing to fill missing times for both admission and bed move data.
            adm_filled_results = pool.starmap(self.fill_missing_out_times, [(group, 'icuin', 'icuout') for _, group in self.dfadm.groupby('hid')])
            bm_filled_results = pool.starmap(self.fill_missing_out_times, [(group, 'bedin', 'bedout') for _, group in self.dfbm.groupby('hid')])

        adm_filled = pd.concat(adm_filled_results).reset_index(drop=True)
        bm_filled = pd.concat(bm_filled_results).reset_index(drop=True)
        # Merge the filled admission data with the filled bed move data on 'hid' and 'icuroom' to create a unified dataset.
        merged_data = pd.merge(bm_filled, adm_filled[['hid', 'icuroom', 'icuin', 'icuout', 'icuout_modified']], on=['hid', 'icuroom'], how='outer')
        
        print("[{}] Data merging and filling completed.".format(datetime.now()))
        return merged_data

    def filter_bedmoves(self, group, group_keys, check_necessary):
        """
        Filters bed movement records for a patient group based on ICU admission (icuin) and discharge (icuout) times.
        It selects records where bed movement times ('bedin' and 'bedout') overlap with the specified ICU stay period ('icuin' and 'icuout').
        
        Parameters:
        - group (DataFrame): DataFrame containing bed movement records for a specific group of patient movements, grouped by hid, icuroom, icuin and icuout
        - group_keys (tuple): Tuple containing hid, icuroom, icuin, and icuout.
        - check_necessary (DataFrame): DataFrame to accumulate records that require further check.

        Returns:
        - (DataFrame, DataFrame): A tuple of DataFrames, where the first DataFrame contains the filtered valid bed movement records for the specific ICU stay period,
                                and the second DataFrame contains records that need further checks.
        """      
        hid, icuroom, icuin, icuout = group_keys

        group = group.sort_values(by='bedin')
        group_copy = group.copy()

        condition1 = group['bedin'] <= icuin
        condition2 = group['bedout'] >= icuin
        condition3 = group['bedin'] >= icuin
        condition4 = group['bedin'] <= icuout
        valid_records = group[(condition1 & condition2)|(condition3 & condition4)]
        excluded_group = group_copy[~group_copy.index.isin(valid_records.index)]
        # Extracting rows that meet the conditions.
        if not valid_records.empty:
            return valid_records, check_necessary

        else: 
            if not excluded_group.empty:
                # Identify rows with missing bedin or bedout. 
                non_empty_bed_records = excluded_group.dropna(subset=['bedin', 'bedout'])

                if not non_empty_bed_records.empty:
                    print(f'non_empty_bed_records:{non_empty_bed_records}')
                    # Calculate differences between bedin/bedout and icuin/icuout
                    # locate the rows with the minimum time difference, indicating the closest bedin/bedout times to icuin/icuout
                    non_empty_bed_records['bedin_diff'] = (non_empty_bed_records['bedin'] - icuout).abs()
                    non_empty_bed_records['bedout_diff'] = (non_empty_bed_records['bedout'] - icuin).abs()
                    non_empty_bed_records['min_diff'] = non_empty_bed_records[['bedin_diff', 'bedout_diff']].min(axis=1)
                    nearest_row_index = non_empty_bed_records['min_diff'].idxmin()
                    nearest_row = non_empty_bed_records.loc[nearest_row_index]

                    if nearest_row['min_diff'] <= pd.Timedelta(days=1):
                        selected_row = nearest_row.copy()
                        check_necessary = pd.concat([check_necessary, pd.DataFrame([selected_row])], ignore_index=True)
                        check_necessary = check_necessary.drop(columns=['bedin_diff', 'bedout_diff', 'min_diff'], errors='ignore')

        return valid_records, check_necessary

    def filter_check_necessary(self, results_df, check_necessary_df):

        merged_df = pd.merge(check_necessary_df, results_df, on=['bedin', 'bedout'], how='left', indicator=True)
        left_only_rows = merged_df[merged_df['_merge'] == 'left_only']

        selected_columns = {
            col: col.rstrip('_x') for col in left_only_rows.columns if col.endswith('_x') or col in ['bedin', 'bedout']
        }
        selected_rows = left_only_rows.rename(columns=selected_columns)[list(selected_columns.values())]
        new_rows = selected_rows[check_necessary_df.columns]

        selected_rows['bedin'] = selected_rows['icuin']
        selected_rows['bedout'] = selected_rows['icuout']
        results_df = pd.concat([results_df, selected_rows], ignore_index=True)

        return results_df

    def adjust_bedmoves(self, group, group_keys):
        """
        Adjust the bed movement records for a group of patient movements based on ICU admission and discharge times.

        This function takes a DataFrame of bed movements for a single patient (group) and a tuple of keys 
        (hid, icuroom, icuin, icuout).

        Parameters:
        - group (DataFrame): The bed movement records for a specific patient.
        - group_keys (tuple): A tuple containing the patient's ID (hid), ICU room code (icuroom), 
                            ICU admission time (icuin), and ICU discharge time (icuout). 

        Returns:
        - DataFrame: The adjusted bed movement records for the patient.
        """
        hid, icuroom, icuin, icuout = group_keys
        group = group.sort_values(by='bedin')
        # Extracting rows that meet the conditions.
        if not group.empty:
            # If there is only one bed movement record for the patient
            if len(group) == 1:
                if group.at[group.index[0], 'bedin'] > icuin and (group.at[group.index[0], 'bedin'] - icuin) > timedelta(hours=2):
                    group.at[group.index[0], 'bedout'] = icuout
                else:
                    group.at[group.index[0], 'bedin'] = icuin
                    group.at[group.index[0], 'bedout'] = icuout                        

            elif len(group) > 1:
                # Adjust the bedout time of each record to the bedin time of the next record.
                group['bedout'].iloc[:-1] = group['bedin'].iloc[1:].values
                # Check if the first bed movement entry time is more than 2 hours after ICU admission
                if group.at[group.index[0], 'bedin'] > icuin and (group.at[group.index[0], 'bedin'] - icuin) > timedelta(hours=2):
                    group.at[group.index[-1], 'bedout'] = icuout
                else:
                    group.at[group.index[0], 'bedin'] = icuin
                    group.at[group.index[-1], 'bedout'] = icuout

        return group

    def adjust_null_bedout(self, group):
        group = group.sort_values(by='bedin')
        next_bedin = group['bedin'].shift(-1)
        # When 'bedout' is a modified null value, adjust it if it's greater than the next 'bedin
        group.loc[(group['bedout_modified']) & (group['bedout'] >= next_bedin), 'bedout'] = next_bedin

        return group

    def process_and_save_bedmoves(self, merged_data):
        """
        Processes and saves the bed movement records after filtering and adjusting them based on ICU admission and discharge times.

        This function first filters bed movement records to select those that overlap with ICU stay periods. 
        It then checks for any records that require further examination and processes them accordingly. 
        After filtering, it adjusts the bed movement records to ensure they accurately reflect the actual bed movements during the ICU stay. 
        Finally, it consolidates the results and saves them to a CSV file.

        Parameters:
        - merged_data (DataFrame): The DataFrame containing merged bed movement and ICU stay records, 
                                with columns for patient ID ('hid'), ICU room code ('icuroom'), 
                                ICU admission time ('icuin'), and ICU discharge time ('icuout'), 
                                bed number ('bed'), bed entry time ('bedin'), and bed exit time ('bedout').
        Returns:
        - DataFrame: The final processed DataFrame of bed movement records.

        """
        filter_results = [] # To store filtered groups
        check_necessary_list = [] # To store groups that need further checks
        for group_keys, group in merged_data.groupby(['hid', 'icuroom','icuin', 'icuout']):
            group_processed, check_part = self.filter_bedmoves(group, group_keys, pd.DataFrame())
            filter_results.append(group_processed)
            check_necessary_list.append(check_part)

        filter_results_df = pd.concat(filter_results, ignore_index=True)
        check_necessary_df = pd.concat(check_necessary_list, ignore_index=True)

        filtered_df = self.filter_check_necessary(filter_results_df, check_necessary_df)
        
        adjust_results = [] # To store adjusted groups after filtering
        for group_keys, group in filtered_df.groupby(['hid', 'icuroom','icuin', 'icuout']):
            group_processed = self.adjust_bedmoves(group, group_keys)
            adjust_results.append(group_processed)

        adjust_results_df = pd.concat(adjust_results, ignore_index=True)  

        bedmoves_result = adjust_results_df.groupby(['icuroom', 'bed']).apply(self.adjust_null_bedout).reset_index(drop=True)
        # Save the final processed bed movements to a CSV file.
        bedmoves_result.to_csv(self.moves_filename)
        print(f"[{datetime.now()}] Bed moves processed and saved.")

        return bedmoves_result

class VitalFileMatcher:
    def __init__(self, bedmoves_data=None, moves_filepath=None):

        if bedmoves_data is not None:
            # Use processed data from MovementRefinement
            self.df_moves = bedmoves_data
        elif moves_filepath is not None:
            # Load bedmovement data from a CSV file
            self.df_moves = pd.read_csv(moves_filepath, parse_dates=['bedin', 'bedout'], low_memory=False)
        else:
            # Raise Error if no data source is provided
            raise ValueError("No data source provided for VitalFileMatcher")

        self.df_moves = self.prepare_bedmove_data(self.df_moves)

    def prepare_bedmove_data(self, df_moves):
        """
        Prepares bed movement data by aligining ICU room codes with Vital Recorder names.
        Modify the 'icuroom' filed in the bedmovement data to match the VR names used in the Vital file's names. 
        """
        replacements = {'PEICU': 'PICU', 'RICU': 'CPICU', 'SICU': 'SICU1', 'DICU1': 'DICU'}
        df_moves['icuroom'].replace(replacements, inplace=True)
        df_moves['bed'] = df_moves['bed'].astype(int).astype(str)
        condition = (df_moves['icuroom'] == 'CCU') | (df_moves['icuroom'] == 'CPICU')
        df_moves['location_id1'] = df_moves['icuroom'] + '_' + df_moves[~df_moves['icuroom'].str.contains('CCU|CPICU')]['bed'].str.zfill(2)
        df_moves['location_id2'] = df_moves['icuroom'] + '_' + df_moves[df_moves['icuroom'].str.contains('CCU|CPICU')]['bed']
        df_moves['location_id'] = df_moves['location_id1'].fillna('') + df_moves['location_id2'].fillna('')
        return df_moves

    def match_vital_files(self, vitaldb_credentials, admission_hids, num_processes):
        """
        Matches vital files with bed movement records using multiprocessing.

        Parameters:
        - vitaldb_credentials (dict): Credentials required to access the VitalDB API.
        - admission_hids (list): List of patient IDs to include in the matching process.
        - num_processes (int): Number of processes to use for parallel processing.
        """
        print(f"[{datetime.now()}] Starting vital file matching...")
        # Group location IDs by ICU room for batch processing
        grouped_location_ids = self.df_moves.groupby('icuroom')['location_id'].unique()
        # Use multiprocessing to handle each ICU room's data in parallel
        with Pool(processes=num_processes) as pool:
            pool.map(self.process_icuroom, [(icuroom, location_ids, vitaldb_credentials, admission_hids) for icuroom, location_ids in grouped_location_ids.iteritems()])
        print(f"[{datetime.now()}] Vital file matching completed.")


    def process_icuroom(self, params):
        """
        Processes each ICU room's data to match vital files with corresponding bed movement records.
        - Log into the VitalDB API with the provided credentials to access vital file data.
        - Iterating through each location ID within an ICU room to retrieve and process the list of vital files.
        - Matching these files with bed movement records based on the location ID and the time overlap between bed occupancy and file timestamps.
        - Compiling the results into comprehensive lists of all vital files and their matches.
        - Saving these lists into CSV files for further analysis.

        Parameters:
        - params (tuple): A tuple containing the ICU room name, location IDs, VitalDB credentials, and admission patient IDs.
        """

        icuroom, location_ids, vitaldb_credentials, admission_hids = params  
        print(f"[{datetime.now()}] Processing icuroom: {icuroom}")
        # Log into the VitalDB API with the provided credentials
        vitaldb.api.login(**vitaldb_credentials)
        # Prepare file paths for saving the results.  
        result_file = f'matched_list/{icuroom}_matched_file.csv'
        refined_file = f'matched_list/{icuroom}_refined_file.csv'
        vitalfiles_list = f'vitalfiles/{icuroom}_vitalfiles.csv'

        all_matches = []        # To store matching results
        all_vitalfiles = []     # To store retrived vital files lists
        # Iterate through each location ID to process corresponding vital files.
        for location_id in location_ids:
            print(f"[{datetime.now()}] Processing icuroom: {location_id}")
            # Select bed movement records specific to the current ICU room
            df_icu = self.df_moves.loc[self.df_moves['icuroom'] == icuroom ]
            # Fetch the list of vital files associtated with the current location ID
            df_filelist = self.get_filelist_by_bedroom(location_id)
            # Match vital files with bed movement records based on overlapping time periods
            df_match = self.match_files_with_patients(df_filelist, df_icu, icuroom)
            all_vitalfiles.append(df_filelist)
            all_matches.append(df_match)
        # Combine all retrived vital files and matching results into single Dataframes
        df_combined_vitalfiles = pd.concat(all_vitalfiles)
        df_combined_matches = pd.concat(all_matches)

        df_combined_vitalfiles.to_csv(vitalfiles_list, index=False, encoding='utf-8-sig')
        df_combined_matches.to_csv(result_file, index=False, encoding='utf-8-sig')
        # Refine the matching results to prioritize valid patient IDs
        df_refined = self.create_new_hid_columns(df_combined_matches, admission_hids)
        df_refined.to_csv(refined_file, index=False, encoding='utf-8-sig')

    def get_filelist_by_bedroom(self, location_id):
        """
        Retrieves a list of vital files from the VitalDB API for a specific location ID.
        location id is a combination of ICU room and bed number(e.g., 'ICU1_01').
        """
        try:
            df_filelist = pd.DataFrame(vitaldb.api.filelist(bedname=location_id, dtstart='2019-01-01', dtend='2023-12-31', hid=True))
            df_filelist.drop(df_filelist[df_filelist['dtend'].str.contains('NaN', na=False, case=False)].index, inplace=True)
            df_filelist['dtend'] = pd.to_datetime(df_filelist['dtend'])
            df_filelist['dtstart'] = pd.to_datetime(df_filelist['dtstart'])
            # Filter files to include only those with a duration greater than 6 minutes
            df_filelist = df_filelist[df_filelist['dtend'] - df_filelist['dtstart'] > timedelta(minutes=6)]
            return df_filelist.sort_values(by='filename').reset_index(drop=True)
        except Exception as e:
            print(f"Error retrieving file list for location {location_id}: {e}")
            # Return an empty DataFrame in case of an error
            return pd.DataFrame()

    def match_files_with_patients(self, df_filelist, df_icu, icuroom):
        """
        Matches vital files with patients based on location_id and bed movement date.
        
        Parameters:
        - df_filelist (DataFrame): A DataFrame containing the list of vital files.
        - df_icu (DataFrame): A DataFrame containing ICU bed movement records.
        - icuroom (str): The name of the ICU room being processed.

        Returns:
        - DataFrame: A DataFrame containing the matched vital files and patient records.
        """
        print(f"[{datetime.now()}] Matching files with patients...")
        required_columns = ['filename', 'hid1', 'hid2', 'dtstart', 'dtend']
        
        if not all(column in df_filelist.columns for column in required_columns):
            print(f"Required columns missing in DataFrame: {required_columns}")
            return pd.DataFrame()  

        if df_filelist.empty:
            print("DataFrame is empty")
            return pd.DataFrame()  

        filelist = df_filelist[required_columns]
        filelist.rename(columns={'hid1' : 'adt1', 'hid2' : 'adt2'}, inplace=True)
        filelist.loc[:, 'icuroom'] = filelist['filename'].str.split('_').str[0]
        filelist = filelist[filelist['icuroom'] == icuroom]
        filelist.loc[:, 'location_id'] = filelist['filename'].str.split('_').str[0] + '_' + filelist['filename'].str.split('_').str[1]
        file_merge = pd.merge(filelist, df_icu, on='location_id', how='left')
        
        cols_to_convert = ['bedin', 'bedout', 'dtstart', 'dtend']
        file_merge[cols_to_convert] = file_merge[cols_to_convert].apply(pd.to_datetime)

        df_match = file_merge.loc[(file_merge['bedin'] - timedelta(hours=1) < file_merge['dtstart']) & (file_merge['dtstart'] <= file_merge['bedout'])]
        df_match.drop_duplicates(subset=['filename','hid'], ignore_index=True, inplace=True)

        out = df_match.groupby('filename', as_index=False).agg({'hid':list})
        out = out.join(pd.DataFrame(out.pop('hid').tolist()).rename(columns=lambda x:f"hid{x+1}"))
        out.dropna(how='all', axis=1, inplace=True)

        if 'filename' not in filelist.columns or 'filename' not in out.columns:
            print("'filename' column missing in one of the DataFrames")
            return pd.DataFrame()  # Return an empty DataFrame or handle the error as needed

        df_match = pd.merge(filelist, out, on='filename', how='left')
        duplicate_check = df_match[df_match.duplicated(subset=['filename'], keep=False)]
        df_match.drop_duplicates(subset=['filename','hid1'], ignore_index=True, inplace=True)
        print(f"[{datetime.now()}] Matched {len(df_match)} files with patients.")

        return df_match

    def create_new_hid_columns(self, df, admission_hids):
        """
        Refines patient id in the dataset by aligning adt from patient monitor with hid from EMR
        - Converts 'adt1' and 'adt2' values to numeric and checks them against a list of valid admission hids.
        - Prioritizes 'adt' values over 'hid' values when both are available.
        - Fills 'new_hid1' and 'new_hid2' with the most relevant ID, ensureing accuracy and preventing duplicates.
        """
        df['adt1'] = pd.to_numeric(df.get('adt1'), errors='coerce')
        df['adt2'] = pd.to_numeric(df.get('adt2'), errors='coerce')

        df['adt1'] = df['adt1'].where(df['adt1'].isin(admission_hids), pd.NA)
        df['adt2'] = df['adt2'].where(df['adt2'].isin(admission_hids), pd.NA)
        # Fill 'new_hid1' with 'adt1' or 'adt2', preferring 'adt1' but using 'adt2' if 'adt1' is NA
        df['new_hid1'] = df['adt1']
        df['new_hid1'] = df['new_hid1'].fillna(df['adt2'])
        df['new_hid2'] = np.where(df['adt1'].notna() & (df['adt1'] != df['adt2']), df['adt2'], pd.NA)
        # Use 'hid1' if 'hid2' is NA, ensuring 'new_hid1' does not introduce duplicates
        if 'hid1' in df.columns and 'hid2' in df.columns:
            df['new_hid1'] = df.apply(lambda row: row['hid1'] if pd.isna(row['hid2']) else row['new_hid1'], axis=1)

        df = df[['filename', 'dtstart', 'dtend', 'new_hid1', 'new_hid2']]
        df.rename(columns={'new_hid1': 'hid1', 'new_hid2': 'hid2'}, inplace=True)

        return df

def main():

    """
    Main script to automate the refinement of bed movement data and its matching with vital files.
    
    Steps:
    1. Set up processing preferences and specify file paths.
    2. Retrieve unique patient IDs from admission data for later validation.
    3. Launch the Bed Movement Refinement process, if chosen.
    4. Execute the Vital File Matching process, if selected, using the refined bed movement data or directly from specified file paths.

    *** Customization Options:
    - Enable/disable movement refinement or vital file matching processes.
    - Specify file paths for admission data, initial bed movement data, and the location for saving refined bed movement data.
    - Set the number of processes for parallel execution to enhance performance.

    Before Running:
    Ensure to update all placeholders for file paths and VitalDB credentials with your specific details to ensure the script runs smoothly.
    """

    # Initial setup: Define whether to use specific processes and set file paths
    use_movement_refinement = True     # Set to False to skip movement refinement process
    use_vitalfile_matcher = True       # Set to False to skip vital file matching process
    admission_filepath = ''            # Path to admission data
    bedmove_filepath = ''              # Path to bed movement data
    refined_bedmove_filepath = ''      # Path to save refined bed movement data

    # Extract unique hospital IDs from the admission table for validation adt
    admission_df = pd.read_excel(admission_filepath)
    admission_hids = admission_df['환자번호'].unique().tolist()

    # Set based on your system's capabilities
    # num_processes = os.cpu_count() // 3 
    num_processes = 1
    
    # Movement Refinement process
    if use_movement_refinement:
        print(f"[{datetime.now()}] Starting Movement Refinement with multiprocessing...")

        bedmoves_refiner = MovementRefinement(bedmove_filepath, admission_filepath, refined_bedmove_filepath)
        merged_moves = bedmoves_refiner.fill_merge_data(num_processes)
        final_bedmoves = bedmoves_refiner.process_and_save_bedmoves(merged_moves)

        print(f"[{datetime.now()}] Movement Refinement completed.")

    # Vital File Matching process
    if use_vitalfile_matcher:
        # MovementRefinement 클래스의 결과를 사용하는 경우
        if use_movement_refinement:
            vitalfile_matcher = VitalFileMatcher(bedmoves_data=final_bedmoves)
        else:
            # bedmove 테이블 불러와서 사용
            vitalfile_matcher = VitalFileMatcher(moves_filepath=refined_bedmove_filepath)        
        # VitalDB API credentials - replace with actual credentials
        vitaldb_credentials = {
            'id': '',  # Your VitalDB ID
            'pw': '',  # Your VitalDB Password
            'host': '' # VitalDB Host
        }
        vitalfile_matcher.match_vital_files(vitaldb_credentials, admission_hids, num_processes)

if __name__ == "__main__":
    freeze_support()  # For Windows support when using multiprocessing
    main()