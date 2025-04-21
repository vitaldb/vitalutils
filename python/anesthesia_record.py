import vitaldb
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime
import matplotlib.gridspec as gridspec

# Load VitalDB file
vf = vitaldb.VitalFile('1.vital')

# Extract data at 5-minute intervals
df = vf.to_pandas(vf.get_track_names(), interval=300, return_datetime=True)
df = df.replace(0, np.nan)
opdate = datetime.fromtimestamp(vf.dtstart).strftime('%Y-%m-%d')
df['Time'] = df['Time'].dt.strftime('%H:%M')

# Create PDF with A4 size
plt.rcParams['font.family'] = 'Malgun Gothic'
plt.figure(figsize=(8.27, 11.69))

cm = 1 / 2.54  # centimeters to inches
mm = cm / 10  # millimeters to inches
paper_width = 210 * mm
ypos = paper_height = 297 * mm
line_height = 10 * mm

plt.xlim(0, paper_width) # A4 size in millimeters
plt.ylim(0, paper_height)
plt.axis('off')
plt.tight_layout(pad=0)

# Title
ypos -= line_height
plt.text(paper_width / 2, ypos, '마 취 기 록 지', fontsize=24, fontweight='bold', ha='center', va='top')

# Patient info
ypos -= line_height * 2
plt.text(line_height, ypos, f"수술일자: {opdate}", fontsize=10, ha='left', va='top')
plt.text(line_height + paper_width / 3, ypos, "집도의: __________________________", fontsize=10, ha='left', va='top')
plt.text(line_height + paper_width * 2 / 3, ypos, "마취의: __________________________", fontsize=10, ha='left', va='top')

ypos -= line_height * 1
plt.text(line_height, ypos, "진단명: __________________________", fontsize=10, ha='left', va='top')
plt.text(line_height + paper_width / 3, ypos, "수술명: __________________________", fontsize=10, ha='left', va='top')
plt.text(line_height + paper_width * 2 / 3, ypos, "응급: Y / N", fontsize=10, ha='left', va='top')

# Define default track configurations
graph_configs = {
    'Solar8000/ART_SBP': {'color':'red', 'marker':'v-', 'label':'SBP', 'min_val':20, 'max_val':200},
    'Solar8000/ART_DBP': {'color':'red', 'marker':'^-', 'label':'DBP', 'min_val':20, 'max_val':200},
    'Solar8000/PLETH_SPO2': {'color':'skyblue', 'marker':'x-', 'label':'SpO2'},
    'Solar8000/HR': {'color':'green', 'marker':'o-', 'label':'HR'},
    'Solar8000/BT': {'color':'brown', 'marker':'^-', 'label':'BT', 'decimal_places': 1},
    'Solar8000/VENT_RR': {'color':'gray', 'marker':'s-', 'label':'RR'},
    'Solar8000/CVP': {'color':'orange', 'marker':'o-', 'label':'CVP'},
}
for track_name in list(graph_configs.keys()):
    if track_name not in df.columns:
        del graph_configs[track_name]

# Vital Chart
ypos -= line_height # Add space before the chart
chart_height = 80 * mm
chart_bottom_y = ypos - chart_height # Calculate the bottom y-coordinate for the chart
ax = plt.axes([20 * mm / paper_width, chart_bottom_y / paper_height, (paper_width - 31 * mm) / paper_width, chart_height / paper_height]) # Position the chart using the calculated bottom
ypos = chart_bottom_y # Update ypos to the bottom of the chart for subsequent elements
ax.set_ylim(0, 200)
ax.grid(True, which='both', linestyle='--', linewidth=0.5)
ax.set_yticks(np.arange(0, 201, 20))
ax.set_yticks(np.arange(0, 201, 10), minor=True)
ax.grid(which='major', alpha=0.7)
ax.grid(which='minor', alpha=0.3)

x = df['Time']

# Plot vital signs using the configurations
for track_name, config in graph_configs.items():
    vals = df[track_name].copy()
    if 'min_val' in config:
        vals[vals < config['min_val']] = np.nan
    if 'max_val' in config:
        vals[vals > config['max_val']] = np.nan
    col = 'black' if 'color' not in config else config['color']
    ax.plot(x, vals, config['marker'], color=col, label=config['label'])
    
    # Add text labels
    for i, val in enumerate(vals):
        if pd.notna(val):
            sval = f'{val:.0f}'
            if 'decimal_places' in config:
                sval = f"{{:.{config['decimal_places']}f}}".format(val)
            ax.text(i, val + 7, sval, fontsize=7, ha='center', color=col)

ax.set_xlim(-0.5, len(df)-0.5) # Set x-axis with time labels
ax.set_xticks(range(0, len(df), 2)) # Label every 2 time points (10 min intervals)
ax.set_xticks(range(0, len(df), 1), minor=True)
ax.tick_params(axis='x', labelbottom=False) # Hide x-axis tick labels
handles, labels = ax.get_legend_handles_labels() # Add legend
ax.legend(handles=handles, loc='upper right', fontsize=8)

# Draw table
table_configs = {
    'Solar8000/FIO2': {'label':'FIO2', 'min_val':20, 'max_val':100},
    'Solar8000/ETCO2': {'label':'ETCO2', 'min_val':1},
    'BIS/BIS': {'label':'BIS', 'min_val':1},
}
for track_name in list(table_configs.keys()):
    if track_name not in df.columns:
        del table_configs[track_name]

if len(table_configs) > 0:
    ypos -= line_height / 2 # Add space before the table
    table_height = (len(table_configs) + 1) * 5 * mm
    ax = plt.axes([8 * mm / paper_width, (ypos - table_height) / paper_height, (paper_width - 16 * mm) / paper_width, table_height / paper_height]) # Position the chart using the calculated bottom
    ypos -= table_height # Update ypos to the bottom of the chart for subsequent elements
    ax.axis('off')

    # Create table data (as before)
    table_data = []
    
    # Add time row (header)
    time_row = ['Time']
    time_colors = ['white']
    
    for i in range(0, len(df), 2):  # Every 10 minutes (2 data points)
        time_row.append(df['Time'].iloc[i])
        time_colors.append('white')
    
    table_data.append(time_row)
    
    # Add data for each tabular track
    for track_name, config in table_configs.items():
        row = [config['label']]
        row_colors = ['white']
        
        vals = df[track_name].copy()
        if 'min_val' in config:
            vals[vals < config['min_val']] = np.nan
        if 'max_val' in config:
            vals[vals > config['max_val']] = np.nan

        for i in range(0, len(df), 2):
            val = vals.iloc[i]
            if pd.notna(val):
                if config.get('decimal_places', 0) > 0:
                    sval = f"{{:.{config['decimal_places']}f}}".format(val)
                else:
                    sval = f'{val:.0f}'
                row.append(sval)
            else:
                row.append('')
            row_colors.append('white')
        table_data.append(row)
    
    # Create the table in ax, filling the axes
    table = ax.table(cellText=table_data, loc='center', cellLoc='center', bbox=[0, 0, 1, 1]) # Fill the ax axes
    
    # Style the table
    table.auto_set_font_size(False)
    table.set_fontsize(7)
    for key, cell in table.get_celld().items():
        cell.set_linewidth(0.5)
        if key[0] == 0 or key[1] == 0:  # Header row or column
            cell.set_text_props(weight='bold')
            cell.set_facecolor('#e6e6e6')  # Light gray background

# Add events to ax_events
events = df[['Time', 'EVENT']].dropna()
if len(events) > 0:
    ypos -= line_height / 2 # Add space before the table
    ax = plt.axes([8 * mm / paper_width, 0, (paper_width - 16 * mm) / paper_width, ypos / paper_height]) # Position the chart using the calculated bottom
    ax.axis('off')
    ax.text(0, 1, "마취 기록:", fontsize=10, fontweight='bold', ha='left', va='top')
    for i in range(len(events)):
        event = events['EVENT'].iloc[i]
        event_time = events['Time'].iloc[i]
        event_text = f"{event_time} {event}"
        ax.text(line_height / paper_height, 1 - (i + 1) * line_height / paper_height, event_text, fontsize=10, ha='left', va='top')

plt.show()
