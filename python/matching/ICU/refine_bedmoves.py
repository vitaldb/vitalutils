import pandas as pd
import os
from datetime import datetime, timedelta

class PatientMovementRefinement:

    def __init__(self, start_date, end_date):
        self.start_date = start_date
        self.end_date = end_date
        self.create_directory()
        # Load bedmove and admission data
        self.dfbm = self.load_data('bedmove')
        self.dfadm = self.load_data('admission')

    def create_directory(self):
        """Create directory based on start and end dates."""
        self.period_str = f"{self.start_date.replace('-', '')[2:]}_{self.end_date.replace('-', '')[2:]}"
        self.moves_dir = f"./{self.period_str}"
        
        if not os.path.exists(self.moves_dir):
            os.makedirs(self.moves_dir)

    def load_data(self, dtype):
        print(f"[{datetime.now()}] Loading {dtype} data...")
        if dtype == 'bedmove':
            file_name = f"{self.moves_dir}/bedmove_{self.period_str}.csv"
            df = pd.read_csv(file_name, parse_dates=['bedin','bedout'], low_memory=False)
            df.rename(columns={'WD_DEPT_CD' : 'icuroom', 'BED_NO' : 'bed', 'IN_DTM' : 'bedin', 'OUT_DTM' : 'bedout'}, inplace=True)
            df = df[['hid','icuroom','bed','bedin','bedout']]
        else:  # admission
            file_name = f"{self.moves_dir}/admission_{self.period_str}.xlsx"
            df = pd.read_excel(file_name, parse_dates=['입실시간','퇴실시간'])
            df.rename(columns={'환자번호':'hid', '입실병동':'icuroom', '입실시간':'icuin', '퇴실시간':'icuout'}, inplace=True)
            df = df[['hid','icuroom','icuin','icuout']]
        return df

    def refine_dataframe(self, df, reference_col, col_to_fill, columns):
        """Refine the dataframe by filling missing or invalid data."""
        df[f'{col_to_fill}_null_check'] = df[col_to_fill].isnull().astype(int)
        df.sort_values(by=reference_col, inplace=True)
        df = df.groupby(['hid'], as_index=False).agg(list)
        last_date = pd.to_datetime(self.end_date + ' 23:59:59')
        
        def filler(row):
            """Helper function to fill missing or incorrect dates."""
            corrected_values=[]
            for i in range(len(row[col_to_fill])):
                current_value = row[col_to_fill][i]
                # Check if the current value is missing or invalid and replace it
                if i != len(row[col_to_fill]) -1:
                    next_entry = row[reference_col][i+1]
                    if pd.isna(current_value) or (current_value > row[reference_col][i+1]):
                        corrected_values.append(row[reference_col][i+1])
                    else:
                        corrected_values.append(current_value)
                # If the last date is missing, replace it with the end of the period
                else:
                    corrected_values.append(last_date if pd.isna(current_value) else current_value)
            return corrected_values
                    
        df[col_to_fill] = df.apply(filler, axis=1)
        df = df.explode(columns, ignore_index=True)
        df = df[df[col_to_fill] - df[reference_col] > timedelta(minutes=1)]
        return df

    def refine_data(self):
        print(f"[{datetime.now()}] Filling missing or incorrect dates in bedmove and admission data...")
        self.dfbm = self.refine_dataframe(self.dfbm, 'bedin', 'bedout', ['icuroom', 'bed', 'bedin', 'bedout', 'bedout_null_check'])
        self.dfadm = self.refine_dataframe(self.dfadm, 'icuin', 'icuout', ['icuroom', 'icuin', 'icuout', 'icuout_null_check'])


    # admission table에는 기록이 있으나 bedmove에 없는 환자 리스트 확인(bm_null.csv)
    def find_missing_bedmoves(self):
        """Find patients who are in the admission table but missing in the bedmove table."""
        icu_in = self._merge_on_nearest_time(self.dfadm, self.dfbm, 'icuin', 'bedin')
        icu_out = self._merge_on_nearest_time(self.dfadm, self.dfbm, 'icuout', 'bedout')
        icu_merge = pd.concat([icu_in, icu_out]).drop_duplicates()
        bm_null = icu_merge.loc[((icu_merge['bed'].isnull()) & (self.start_date < icu_merge['icuout'])),['hid','icuroom','icuin','icuout']]
        bm_null.to_csv(f"{self.moves_dir}/bm_null.csv", index=False, encoding='utf-8-sig')

    def process_merged_data(self):
        print(f"[{datetime.now()}] Processing merged data...")

        # Custom Merge
        bed_in = self._merge_on_nearest_time(self.dfbm, self.dfadm, 'bedin', 'icuin')
        bed_out = self._merge_on_nearest_time(self.dfbm, self.dfadm, 'bedout', 'icuout')     
        self.df_merge = pd.concat([bed_in, bed_out]).drop_duplicates()
        
        # Filter ICU nulls
        self._handle_icu_nulls()

        # Add and process ICU nulls in the merged dataframe
        self.df_merge = self.df_merge[self.df_merge['icuin'].notnull() & 
                                    (self.df_merge['bedin'] < self.df_merge['bedout']) & (self.df_merge['icuin'] < self.df_merge['icuout']) & 
                                    (self.df_merge['bedin'] < self.df_merge['icuout']) & (self.df_merge['icuin'] < self.df_merge['bedout'])]

        # Remove duplicates
        duplicates_mask = self.df_merge.duplicated(subset=['hid', 'icuroom', 'bed', 'bedin', 'bedout'], keep=False)
        no_dups = self.df_merge[~duplicates_mask]
        dups = self.df_merge[duplicates_mask & ((self.df_merge['icuout_null_check'] == 0.0) & (self.df_merge['bedout_null_check'] == 0.0) | 
                                            (self.df_merge['icuin'] <= self.df_merge['bedin']) & (self.df_merge['bedout_null_check'] == 1.0))]
        self.df_merge = pd.concat([no_dups, dups], ignore_index=True)
        self.df_merge = self.df_merge[['hid', 'icuroom', 'bed', 'bedin', 'bedout', 'icuin', 'icuout', 'bedout_null_check', 'icuout_null_check']]
        print(f"[{datetime.now()}] Merged data processed.")
        
    # Merge operations
    def _merge_on_nearest_time(self, left, right, left_on, right_on):
        """Merge two dataframes based on the nearest time"""
        return pd.merge_asof(left.sort_values(left_on), right.sort_values(right_on), 
                            left_on=left_on, right_on=right_on, by=['hid', 'icuroom'], direction="nearest")

    def _handle_icu_nulls(self):
        """Handle ICU null values by saving them to a file and updating the merged dataframe"""
        icu_null = self.df_merge.loc[(self.df_merge['icuin'].isnull()) & (self.start_date <= self.df_merge['bedin']), 
                                ['icuroom', 'bed', 'hid', 'bedin', 'bedout']]
        icu_null.to_csv(f"{self.moves_dir}/icu_null.csv", index=False, encoding='utf-8-sig')
        
        icu_null = icu_null[icu_null['icuroom'].str.contains('CU')]
        icu_null['icuin'] = icu_null['bedin']
        icu_null['icuout'] = icu_null['bedout']
        icu_null['icuout_null_check'] = 1
        icu_null['bedout_null_check'] = 1
        self.df_merge = pd.concat([self.df_merge, icu_null])
        
    def refine_bed_moves(self, df):
        print(f"[{datetime.now()}] Refining bedmoves...")
        
        
        # Group and apply 1)_remove_short_bed_moves method
        df.sort_values(by='bedin', inplace=True)
        df_grouped = df.groupby(['icuroom', 'hid', 'icuin', 'icuout'], as_index=False).agg(list)
        df_grouped['bedin'] = df_grouped.apply(self._remove_short_bed_moves, axis=1)
        df_grouped = self._explode_rows(df_grouped, ['bed', 'bedin', 'bedout', 'bedout_null_check', 'icuout_null_check'])

        # Group and apply 2)/3)_adjust_bed_in/out method
        df_grouped.sort_values(by='bedin', inplace=True)
        df_grouped = df_grouped.groupby(['icuroom', 'hid', 'icuin', 'icuout'], as_index=False).agg(list)
        df_grouped['bedin'] = df_grouped.apply(self._adjust_bed_in, axis=1)
        df_grouped['bedout'] = df_grouped.apply(self._adjust_bed_out, axis=1)
        df_grouped = self._explode_rows(df_grouped, ['bed', 'bedin', 'bedout', 'bedout_null_check', 'icuout_null_check'])

        # Group and apply 4)_check_null_bed_out method
        df_grouped.sort_values(by='bedin', inplace=True)
        df_grouped = df_grouped.groupby(['icuroom', 'bed'], as_index=False).agg(list)
        df_grouped['bedout'] = df_grouped.apply(self._check_null_bed_out, axis=1)
        df_grouped = self._explode_rows(df_grouped, ['hid', 'icuin', 'icuout', 'bedin', 'bedout', 'bedout_null_check', 'icuout_null_check'])

        df_grouped['bed'] = df_grouped['bed'].astype(int)
        print(f"[{datetime.now()}] bedmoves refinement complete.")
        return df_grouped[['hid', 'icuroom', 'bed', 'bedin', 'bedout']]

        print(f"[{datetime.now()}] bedmoves refinement complete.")
    
    #1)
    def _remove_short_bed_moves(self, x):
        """Remove initial bed moves that occurred before ICU admission and lasted less than an hour."""
        bedin_times = []
        for i in range(len(x.bedin)):
            if len(x.bedin) > 1 and i == 0 and (x.bedin[i] < x.icuin) and (x.bedout[i] - x.bedin[i] < pd.Timedelta(hours=1)):
                bedin_times.append('NaT')
            else:
                bedin_times.append(x.bedin[i])
        return bedin_times
    #2
    def _adjust_bed_in(self, x):
        """Adjust bed-in times to match ICU admission times for the first entry."""
        updated_in = []
        for i in range(len(x.bedin)):
            if i==0:
                updated_in.append(x.icuin)
            else:
                updated_in.append(x.bedin[i])
        return updated_in
    #3)
    def _adjust_bed_out(self, x):
        """Adjust bed-out times to ensure consistency with subsequent bed-in times and ICU discharge times."""
        updated_out = []
        for i in range(len(x.bedout)):
            if i == len(x.bedout) -1:
                if (x.icuout_null_check[i] == 1.0) and (x.bedout_null_check[i] == 0.0):
                    updated_out.append(x.bedout[i])
                else:
                    updated_out.append(x.icuout)
            else:
                if x.bedout[i] != x.bedin[i+1]:
                    updated_out.append(x.bedin[i+1])
                else:
                    updated_out.append(x.bedout[i])
        return updated_out
    #4)
    def _check_null_bed_out(self, x):
        """Refine bed-out times that are marked as null or conflict with subsequent bed-in times."""
        corrected_out = []
        for i in range(len(x.bedout)):
            if i != len(x.bedout)-1 and x.bedin[i+1] <= x.bedout[i] and (x.bedout_null_check[i] == 1.0 or x.icuout_null_check[i] == 1.0):
                corrected_out.append(x.bedin[i+1])
            else:
                corrected_out.append(x.bedout[i])
        return corrected_out

    def _explode_rows(self, df, columns_to_explode):
        exploded_df = df.explode(columns_to_explode, ignore_index=True)
        filtered_df = exploded_df.loc[exploded_df['bedin'].notnull()]
        return filtered_df

    def refine_and_save_moves(self, df):
        """Refine the icuroom names, generate location ID, and save the refined data to a CSV file."""
        # Replace icuroom names
        replacements = {'PEICU':'PICU', 'RICU':'CPICU', 'SICU':'SICU1', 'DICU1':'DICU'}
        df['icuroom'].replace(replacements, inplace=True) 
        # Modify the bed column type
        df['bed'] = df['bed'].astype(str)
        # Generate location_id
        df['location_id1'] = df['icuroom'] + '_' + df[~df['icuroom'].str.contains('CCU|CPICU')]['bed'].str.zfill(2)
        df['location_id2'] = df['icuroom'] + '_' + df[df['icuroom'].str.contains('CCU|CPICU')]['bed']
        df['location_id'] = df['location_id1'].fillna('') + df['location_id2'].fillna('')
        # Filter the necessary columns
        df = df[['hid', 'icuroom', 'location_id', 'bedin', 'bedout']]
        # Save the dataframe to a CSV file
        df.to_csv(f"{self.moves_dir}/moves_{self.period_str}.csv", index=False, encoding='utf-8-sig')
        print(f"[{datetime.now()}] Data refinement and saving completed!")
        self.refined_data = df
        return self.refined_data

# Usage
if __name__ == "__main__":
    #Create a refiner instance, refine the data, and save the refined data to a CSV file.
    refiner = PatientMovementRefinement('2020-01-01', '2023-07-31')
    refiner.refine_data()
    refiner.find_missing_bedmoves()
    refiner.process_merged_data()
    refined_df = refiner.refine_bed_moves(refiner.df_merge)
    refiner.refine_and_save_moves(refined_df)

