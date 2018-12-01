#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <string>
#include <vector>
#include <sstream>
#include <iostream>
#include <algorithm>
#include <map>
#include <sys/types.h>
#include <sys/stat.h>
#include "Util.h"
using namespace std;

string dt_to_str(double dt) {
	static char buf[4096];
	time_t t = (time_t)(dt); // ut -> localtime
	tm* ptm = localtime(&t); // simple conversion
	snprintf(buf, 4096, "%04d-%02d-%02d %02d:%02d:%02d",
			 1900 + ptm->tm_year,
			 1 + ptm->tm_mon,
			 ptm->tm_mday,
			 ptm->tm_hour,
			 ptm->tm_min,
			 ptm->tm_sec);
//			 (int)(dt - floor(dt)) * 1000);
	return buf;
}

bool parse_csv(const string& csvSource, vector<vector<string> >& lines) {
	bool inQuote = false;
	bool newLine = false;
	string field;
	lines.clear();
	vector<string> line;
	string::const_iterator aChar = csvSource.begin();
	while (aChar != csvSource.end()) {
		switch (*aChar) {
		case '"':
			newLine = false;
			inQuote = !inQuote;
			break;

		case ',':
			newLine = false;
			if (inQuote == true) {
				field += *aChar;
			} else {
				line.push_back(field);
				field.clear();
			}
			break;

		case '\n':
		case '\r':
			if (inQuote == true) {
				field += *aChar;
			} else {
				if (newLine == false) {
					line.push_back(field);
					lines.push_back(line);
					field.clear();
					line.clear();
					newLine = true;
				}
			}
			break;

		default:
			newLine = false;
			field.push_back(*aChar);
			break;
		}
		aChar++;
	}
	if (field.size()) line.push_back(field);
	if (line.size()) lines.push_back(line);
	return true;
}

int is_dir(const char *path) {
	struct stat path_stat;
	stat(path, &path_stat);
	return S_IFDIR & path_stat.st_mode;
}

int is_file(const char *path) {
	struct stat path_stat;
	stat(path, &path_stat);
	return S_IFREG & path_stat.st_mode;
}

#ifdef _WIN32
#include <Windows.h>
#else
#include <dirent.h>
#endif

// revursively scan dir
bool scan_dir(vector<string> &out, const string &directory) {
#ifdef _WIN32
	WIN32_FIND_DATA file_data;
	HANDLE dir = FindFirstFile((directory + "\\*").c_str(), &file_data);
	if (dir == INVALID_HANDLE_VALUE) return false; // No files found
	do {
		const string file_name = file_data.cFileName;
		const string full_file_name = directory + "\\" + file_name;
		const bool is_directory = (file_data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
		if (file_name[0] == '.') continue;
		if (is_directory) { // recursive scan
			scan_dir(out, full_file_name);
		} else {
			out.push_back(full_file_name);
		}
	} while (FindNextFile(dir, &file_data));
	FindClose(dir);
#else
	DIR *dir;
	class dirent *ent;
	class stat st;
	dir = opendir(directory);
	if (!dir) return false;
	while ((ent = readdir(dir)) != NULL) {
		const string file_name = ent->d_name;
		const string full_file_name = directory + "/" + file_name;
		if (file_name[0] == '.') continue;
		if (stat(full_file_name.c_str(), &st) == -1) continue;
		const bool is_directory = (st.st_mode & S_IFDIR) != 0;
		if (is_directory) { // recursive scan
			scan_dir(out, full_file_name);
		} else {
			out.push_back(full_file_name);
		}
	}
	closedir(dir);
#endif
	return true;
}

int stripos(string shaystack, string sneedle) {
	std::transform(shaystack.begin(), shaystack.end(), shaystack.begin(), ::toupper);
	std::transform(sneedle.begin(), sneedle.end(), sneedle.begin(), ::toupper);
	size_t pos = shaystack.find(sneedle);
	if (pos == shaystack.npos) return -1;
	return pos;
}

int main(int argc, char* argv[]) {
	if (argc < 2) {
		fprintf(stderr, "Print the summary of vital files in a directory.\n\n\
Usage : %s [DIR]\n\n", basename(argv[0]).c_str());
		return -1;
	}
	argc--; argv++;

	string path = argv[0];
	vector<string> filelist;
	if (is_file(path.c_str())) {
		filelist.push_back(path);
	} else if (is_dir(path.c_str())) {
		scan_dir(filelist, path);
	} else {
		fprintf(stderr, "file does not exists\n");
		return -1;
	}

	printf("filename,path,dtstart,dtend,hrend,length,sevo,des,ppf,rftn,abp,cvp,co,bis,invos,abpavg,cvpavg\n");

	for (int i = 0; i < filelist.size(); i++) {
		string path = filelist[i];
		if (path.size() <= 6) continue;
		if (stripos(path.substr(path.size() - 6), ".vital") == -1) continue;

		string cmd = string("vital_trks \"") + path + "\"";
		FILE* f = _popen(cmd.c_str(), "r");
		if (!f) continue;
		ostringstream output;
		while (!feof(f) && !ferror(f)) {
			char buf[128];
			int bytesRead = fread(buf, 1, 128, f);
			output.write(buf, bytesRead);
		}
		string result = output.str();
		_pclose(f);

		printf("%s,%s,", escape_csv(basename(path)).c_str(), escape_csv(path).c_str());
		vector<vector<string>> rows;
		if (!parse_csv(result, rows)) {
			continue;
		}

		// 행의 첫 글자가 # 이면? infos 로 추출
		int nfirstline = 0;
		map<string, double> infos;
		for (int j = 0; j < rows.size(); j++) {
			vector<string>& tabs = rows[j];
			if (tabs.size() < 2) continue;
			if (tabs[0].size() < 2) continue;
			if (tabs[0][0] == '#') {
				infos[tabs[0].substr(1)] = atof(tabs[1].c_str());
				nfirstline = j + 1;
			}
		}

		if (rows.size() <= 1) {
			putchar('\n');
			continue;
		}

		double dtstart = infos["dtstart"];
		double dtend = infos["dtend"];
		double dtlen = dtend - dtstart;
		if (dtstart) {
			printf(dt_to_str(dtstart).c_str());
		}
		putchar(',');
		if (dtend) {
			printf(dt_to_str(dtend).c_str());
		}
		putchar(',');

		unsigned char hassevo = 0;
		unsigned char hasdes = 0;
		unsigned char hasppf = 0;
		unsigned char hasrftn = 0;
		unsigned char hasabp = 0;
		unsigned char hascvp = 0;
		unsigned char hasco = 0;
		unsigned char hasbis = 0;
		unsigned char hasinvos = 0;

		// tab 이름을 읽음
		vector<string> tabnames;
		if (rows.size() > nfirstline) {
			tabnames = rows[nfirstline];
		}
		nfirstline++;

		// 각 변수들의 인덱스를 읽음
		// tname,tid,dname,did,rectype,dtstart,dtend,srate,minval,maxval,avgval,firstval
		int dtend_idx = find(tabnames.begin(), tabnames.end(), "dtend") - tabnames.begin();

		int tname_idx = find(tabnames.begin(), tabnames.end(), "tname") - tabnames.begin();
		
		int maxval_idx = find(tabnames.begin(), tabnames.end(), "maxval") - tabnames.begin();
		if (maxval_idx == tabnames.size()) {
			putchar('\n');
			continue;
		}

		int rectype_idx = find(tabnames.begin(), tabnames.end(), "rectype") - tabnames.begin();
		if (rectype_idx == tabnames.size()) {
			putchar('\n');
			continue;
		}

		int firstval_idx = find(tabnames.begin(), tabnames.end(), "firstval") - tabnames.begin();
		if (firstval_idx == tabnames.size()) {
			putchar('\n');
			continue;
		}

		int avgval_idx = find(tabnames.begin(), tabnames.end(), "avgval") - tabnames.begin();
		if (avgval_idx == tabnames.size()) {
			putchar('\n');
			continue;
		}

		// 각 행을 읽어들여 has_변수들을 업데이트함
		double hrend = 0;
		string abpavg;
		string cvpavg;
		for (int j = 0; j < rows.size(); j++) {
			vector<string>& tabs = rows[j];

			string tname = tabs[tname_idx];

			if (tabs.size() <= maxval_idx) continue;
			float maxval = atof(tabs[maxval_idx].c_str());
			
			if (tabs.size() <= firstval_idx) continue;
			string firstval = tabs[firstval_idx];

			if (tabs.size() <= rectype_idx) continue;
			string rectype = tabs[rectype_idx];

			if (!hassevo) if (stripos(tname, "SEVO") > -1 && maxval > 0) hassevo = 1;
			if (!hassevo) if (stripos(tname, "AGENT") > -1 && stripos(firstval, "SEVO") > -1) hassevo = 1;
			if (!hasdes) if (stripos(tname, "DES") > -1 && maxval > 0) hasdes = 1;
			if (!hasdes) if (stripos(tname, "AGENT") > -1 && stripos(firstval, "DES") > -1) hasdes = 1;
			if (!hasppf) if (stripos(tname, "DRUG") > -1 && stripos(firstval, "PROP") > -1) hasppf = 1;
			if (!hasrftn) if (stripos(tname, "DRUG") > -1 && stripos(firstval, "REMI") > -1) hasrftn = 1;
			if (!hasabp) if (stripos(tname, "ART") > -1 && rectype == "NUM" && maxval > 50) hasabp = 1;
			if (!hascvp) if (stripos(tname, "CVP") > -1 && rectype == "NUM") hascvp = 1;
			if (!hasco) if (tname == "CO" && rectype == "NUM") hasco = 1;
			if (!hasbis) if (stripos(tname, "BIS") > -1 && rectype == "NUM" && maxval > 0) hasbis = 1;
			if (!hasinvos) if (stripos(tname, "SCO") > -1 && rectype == "NUM" && maxval > 0) hasinvos = 1;

			if (tabs.size() > dtend_idx) {
				if (tname == "HR") {
					hrend = atof(tabs[dtend_idx].c_str());
				}
			}

			if (tabs.size() > avgval_idx) {
				if (stripos(tname, "ART") > -1 && stripos(tname, "MBP") > -1 && rectype == "NUM") abpavg = tabs[avgval_idx];
				if (stripos(tname, "CVP") > -1 && stripos(tname, "MBP") > -1 && rectype == "NUM") cvpavg = tabs[avgval_idx];
			}
		}

		printf("%s,", dt_to_str(hrend).c_str());

		if (dtstart || dtend) printf("%lf", dtlen);
		putchar(',');

		printf("%u,%u,%u,%u,%u,%u,%u,%u,%u,%s,%s\n", hassevo, hasdes, hasppf, hasrftn, hasabp, hascvp, hasco, hasbis, hasinvos, abpavg.c_str(), cvpavg.c_str());
	}

	return 0;
}
