#include <stdio.h>
#include <assert.h>
#include <vector>
#include <map>
#include <set>
#include <stdarg.h>  // For va_start, etc.
#include <memory>    // For std::unique_ptr
#include <algorithm>
#include "GZReader.h"
#include "Util.h"
using namespace std;

bool isNotPrintable(char c) {
	return !((c >= 32 && c <127) || c==10 || c==13 || c==9);
}

int main(int argc, char* argv[]) {
	if (argc == 1) {
		fprintf(stderr, "Print track information from vital file\n\n\
Usage : %s [-s] FILENAME \nOptions : -s Print comma seperated device name/track name list only\n\n", basename(argv[0]).c_str());
		return -1;
	}
	argc--; argv++; // 자기 자신의 실행 파일명 제거

	bool is_short = false;
	if (argc > 0) {
		string opts(argv[0]);
		if (opts.substr(0, 1) == "-") {
			argc--; argv++;
			if (opts.find('s') != -1) is_short = true;
		}
	}

	GZReader gz(argv[0]);
	if (!gz.opened()) {
		fprintf(stderr, "file does not exists\n");
		return -1;
	}

	////////////////////////////////////////////////////////////
	// header
	////////////////////////////////////////////////////////////
	map<unsigned long, string> did_dnames;
	map<unsigned short, string> tid_tnames;
	map<unsigned short, unsigned long> tid_dids;
	map<unsigned short, string> tid_dnames;
	map<unsigned short, unsigned char> tid_rectypes;
	map<unsigned short, float> tid_srates;
	map<unsigned short, double> tid_dtstart;
	map<unsigned short, double> tid_dtend;
	map<unsigned short, float> tid_mins;
	map<unsigned short, double> tid_sums;
	map<unsigned short, unsigned long> tid_cnts;
	map<unsigned short, float> tid_maxs;
	map<unsigned short, string> tid_firstvals;
	set<unsigned short> used_tids;
	vector<unsigned short> tids;
	string results;
	double dtstart = 0, dtend = 0;

	char sign[4];
	if (!gz.read(sign, 4)) return -1;
	if (strncmp(sign, "VITA", 4) != 0) {
		fprintf(stderr, "file does not seem to be a vital file\n");
		return -1;
	}
	if (!gz.skip(4)) return -1;
	
	unsigned short len; // header length
	if (!gz.read(&len, 2)) return -1;

	short dgmt;
	if (len >= 2) {
		if (!gz.read(&dgmt, sizeof(dgmt))) return -1;
		len -= 2;
	}

	if (!gz.skip(len)) return -1;
	
	////////////////////////////////////////////////////////////
	// body
	////////////////////////////////////////////////////////////
	while (!gz.eof()) { // body는 패킷의 연속이다.
		unsigned char type; if (!gz.read(&type, 1)) break;
		unsigned long datalen; if (!gz.read(&datalen, 4)) break;
		if (datalen > 1000000) break;

		// tname, tid, dname, did, type (NUM, STR, WAV), srate
		if (type == 0) { // trkinfo
			unsigned short tid; if (!gz.fetch(tid, datalen)) goto next_packet;
			unsigned char rectype; if (!gz.fetch(rectype, datalen)) goto next_packet;
			unsigned char recfmt; if (!gz.fetch(recfmt, datalen)) goto next_packet;
			string tname; if (!gz.fetch(tname, datalen)) goto next_packet; 
			string unit; 
			float minval = 0.0f; 
			float maxval = 0.0f;
			unsigned long col = 0xFFFFFFFF;
			float srate = 0.0f;
			double adc_gain = 1.0;
			double adc_offset = 0.0;
			unsigned char montype = 0;
			unsigned long did = 0;
			if (!gz.fetch(unit, datalen)) goto save_and_next_packet;
			if (!gz.fetch(minval, datalen)) goto save_and_next_packet;
			if (!gz.fetch(maxval, datalen)) goto save_and_next_packet;
			if (!gz.fetch(col, datalen)) goto save_and_next_packet;
			if (!gz.fetch(srate, datalen)) goto save_and_next_packet;
			if (!gz.fetch(adc_gain, datalen)) goto save_and_next_packet;
			if (!gz.fetch(adc_offset, datalen)) goto save_and_next_packet;
			if (!gz.fetch(montype, datalen)) goto save_and_next_packet;
			if (!gz.fetch(did, datalen)) goto save_and_next_packet;

save_and_next_packet:
			// 마지막에 출력하기 위해 저장
			tids.push_back(tid);
			tid_tnames[tid] = tname;
			tid_dnames[tid] = did_dnames[did];
			tid_dids[tid] = did;
			if (!is_short) {
				tid_rectypes[tid] = rectype;
				tid_srates[tid] = srate;
			}
		} else if (type == 9) { // devinfo
			unsigned long did; if (!gz.fetch(did, datalen)) goto next_packet;
			string dtype; if (!gz.fetch(dtype, datalen)) goto next_packet;
			string dname; if (!gz.fetch(dname, datalen)) goto next_packet;
			if (dname.empty()) dname = dtype;
			did_dnames[did] = dname;
		} else if (type == 1) { // rec
			unsigned short infolen = 0; if (!gz.fetch(infolen, datalen)) goto next_packet;
			double dt = 0; if (!gz.fetch(dt, datalen)) goto next_packet;
			unsigned short tid = 0; if (!gz.fetch(tid, datalen)) goto next_packet;

			// 전체 파일의 dtstart, dtend만 구함
			if (!dtstart) dtstart = dt;
			else if (dtstart > dt) dtstart = dt;
			if (dtend < dt) dtend = dt;

			if (is_short) {
				used_tids.insert(tid);
				goto next_packet;
			}

			// 트랙별 dtstart, dtend 구함
			if (!tid_dtstart[tid] || tid_dtstart[tid] > dt) tid_dtstart[tid] = dt;
			if (tid_dtend[tid] < dt) tid_dtend[tid] = dt;

			unsigned char rectype = tid_rectypes[tid];
			if (rectype == 2) { // numeric records
				float fval; if (!gz.fetch(fval, datalen)) goto next_packet;
				
				auto it_mins = tid_mins.find(tid);
				if (it_mins == tid_mins.end()) tid_mins[tid] = fval;
				else if (it_mins->second > fval) tid_mins[tid] = fval;

				auto it_maxs = tid_maxs.find(tid);
				if (it_maxs == tid_maxs.end()) tid_maxs[tid] = fval;
				else if (it_maxs->second < fval) tid_maxs[tid] = fval;

				auto it_cnts = tid_cnts.find(tid);
				if (it_cnts == tid_cnts.end()) tid_cnts[tid] = 1;
				else tid_cnts[tid]++;

				auto it_sums = tid_sums.find(tid);
				if (it_sums == tid_sums.end()) tid_sums[tid] = fval;
				else tid_sums[tid] += fval;

				if (tid_firstvals.find(tid) == tid_firstvals.end()) tid_firstvals[tid] = string_format("%f", fval);
			} else if (rectype == 5) { // str
				if (!gz.skip(4, datalen)) goto next_packet;	

				string sval; if (!gz.fetch(sval, datalen)) goto next_packet;
				sval.erase(std::remove_if(sval.begin(), sval.end(), isNotPrintable), sval.end());

				if (tid_firstvals.find(tid) == tid_firstvals.end()) tid_firstvals[tid] = sval;
			}
		} 

next_packet:
		if (!gz.skip(datalen)) break;
	}

	////////////////////////////////////////////////////////////
	// finish
	////////////////////////////////////////////////////////////
	if (is_short) {
		printf("#dtstart=%u,#dtend=%u", (unsigned long)dtstart, (unsigned long)dtend);
		for (unsigned int i = 0; i < tids.size(); i++) {
			unsigned short& tid = tids[i];
			string tname = escape_csv(tid_tnames[tid]);
			string dname = escape_csv(tid_dnames[tid]);
			auto it_cnts = used_tids.find(tid);
			if (it_cnts != used_tids.end()) {
				printf(",%s/%s", dname.c_str(), tname.c_str());
			}
		}
		return 0;
	}

	printf("#dgmt,%f\n", dgmt / 60.0);
	printf("#dtstart,%lf\n", dtstart);
	printf("#dtend,%lf\n", dtend);
	printf("tname,tid,dname,did,rectype,dtstart,dtend,srate,minval,maxval,cnt,avgval,firstval\n");
	for (unsigned int i = 0; i < tids.size(); i++) {
		unsigned short& tid = tids[i];
		string stype;
		switch (tid_rectypes[tid]) {
		case 1: stype = "WAV"; break;
		case 2: stype = "NUM"; break;
		case 5: stype = "STR"; break;
		}
		string tname = escape_csv(tid_tnames[tid]);
		string dname = escape_csv(tid_dnames[tid]);
		string smin, smax, scnt, savg, sfirst;
		auto it_mins = tid_mins.find(tid);
		auto it_maxs = tid_maxs.find(tid);
		auto it_sums = tid_sums.find(tid);
		if (it_mins != tid_mins.end()) smin = string_format("%f", it_mins->second);
		if (it_maxs != tid_maxs.end()) smax = string_format("%f", it_maxs->second);

		auto it_firstvals = tid_firstvals.find(tid);
		if (it_firstvals != tid_firstvals.end()) {
			sfirst = escape_csv(it_firstvals->second);
		}

		auto it_cnts = tid_cnts.find(tid);
		if (it_cnts != tid_cnts.end()) {
			scnt = escape_csv(string_format("%d", it_cnts->second));
			if (it_cnts->second > 0) {
				if (it_sums != tid_sums.end()) {
					savg = escape_csv(string_format("%f", it_sums->second / it_cnts->second));
				}
			}
		}

		string ssrate;
		if (tid_srates[tid]) ssrate = string_format("%f", tid_srates[tid]);

		printf("%s,%u,%s,%u,%s,%lf,%lf,%s,%s,%s,%s,%s,%s\n", tname.c_str(), tid, dname.c_str(), tid_dids[tid], stype.c_str(), tid_dtstart[tid], tid_dtend[tid], ssrate.c_str(), smin.c_str(), smax.c_str(), scnt.c_str(), savg.c_str(), sfirst.c_str());
	}
	return 0;
}