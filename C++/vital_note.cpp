#include <stdio.h>
#include <stdlib.h>  // exit()
#include <assert.h>
#include <zlib.h>
#include <string>
#include <vector>
#include <map>
#include <stdarg.h>  // For va_start, etc.
#include <memory>    // For std::unique_ptr
#include <time.h> 
#include "GZReader.h"
#include "Util.h"
using namespace std;

void print_usage(const char* progname) {
	printf("Deidentify vital file\n\n\
Usage : %s INPUT_PATH OUTPUT_PATH NOTE\n\n\
INPUT_PATH: input vital file path\n\
OUTPUT_PATH: output vital file path\n\
NOTE: new event string\n\n", basename(progname).c_str());
}

int main(int argc, char* argv[]) {
	if (argc < 3) {
		print_usage(argv[0]);
		return -1;
	}
	argc--; argv++; // 자기 자신의 실행 파일명 제거

	GZReader gi(argv[0]);
	if (!gi.opened()) {
		fprintf(stderr, "input file does not exists\n");
		return -1;
	}

	GZWriter go(argv[1]);
	if (!go.opened()) {
		fprintf(stderr, "cannot open output file\n");
		return -1;
	}

	// event list
	double dt_first = -1;
	double dt_last = -1;
	vector<pair<double, string>> evts;
	if (argc > 2) {
		string str = replace_all(argv[2], "\r\n", "\n");
		str = replace_all(str, "\\n", "\n");
		str = replace_all(str, "\n \n", "\n\n");
		str = replace_all(str, "\n \n", "\n\n");
		auto evtlines = explode(str, "\n\n");
		for (auto evtline : evtlines) {
			// 첫 문장 뽑음
			auto ipos = evtline.find('\n');
			if (ipos == string::npos) continue;
			auto stime = evtline.substr(0, ipos);
			auto sevt = evtline.substr(ipos + 1);
			double dt = parse_dt(stime);
			if (dt_first == -1 || dt_first > dt) dt_first = dt;
			if (dt_last == -1 || dt_last < dt) dt_last = dt;
			evts.push_back(make_pair(dt, sevt));
		}
	}

	unsigned short tid_evt = 0; // event trkid
	unsigned short tid_max = 0;

	// header
	char sign[4];
	if (!gi.read(sign, 4)) return -1;
	if (strncmp(sign, "VITA", 4) != 0) {
		fprintf(stderr, "file does not seem to be a vital file\n");
		return -1;
	}
	if (!gi.skip(4)) return -1; // version
	
	unsigned short headerlen; // header length
	if (!gi.read(&headerlen, 2)) return -1;
	if (!gi.skip(headerlen)) return -1;

	// 1st pass to find out dtstart
	double dtstart = DBL_MAX;
	double dtend = -1;
	while (!gi.eof()) { // body is just a list of packet
		unsigned char type; if (!gi.read(&type, 1)) break;
		unsigned long datalen; if (!gi.read(&datalen, 4)) break;
		if(datalen > 1000000) break;
		if (type == 0) { // trkinfo : tname, tid, dname, did, type (NUM, STR, WAV), srate
			unsigned short tid; if (!gi.fetch(tid, datalen)) goto next_packet;
			if (tid > tid_max) tid_max = tid;
			gi.skip(2, datalen);
			string tname; if (!gi.fetch(tname, datalen)) goto next_packet;
			string unit; if (!gi.fetch(unit, datalen)) goto next_packet;
			gi.skip(4 + 4 + 4 + 4 + 8 + 8 + 1, datalen);
			unsigned long did; if (!gi.fetch(did, datalen)) goto next_packet;
			if (did == 0 && tname == "EVENT") {
				tid_evt = tid;
			}
		} else if (type == 9) { // devinfo
			goto next_packet;
		} else if (type == 1) { // rec
			unsigned short infolen; if (!gi.fetch(infolen, datalen)) goto next_packet;
			double dt_rec_start; if (!gi.fetch(dt_rec_start, datalen)) goto next_packet;
			if (!dt_rec_start) goto next_packet;
			if (dtstart > dt_rec_start) dtstart = dt_rec_start;
			if (dtend < dt_rec_start) dtend = dt_rec_start;
		}

next_packet:
		if (!gi.skip(datalen)) break;
	}

	vector<unsigned char> buf;

	// second pass
	gi.rewind();
	buf.resize(10 + headerlen);
	if (!gi.read(&buf[0], 10 + headerlen)) return -1; // read header
	buf[10] = buf[11] = 0; // clear tzbias
	if (!go.write(&buf[0], 10 + headerlen)) return -1; // write header

	if (tid_evt == 0) {
		// SAVE_TRKINFO
		unsigned char b = 0;
		go.write(&b, 1);

		unsigned long len = 13;
		go.write(&len, 4);

		tid_evt = tid_max + 1;
		go.write(&tid_evt, 2);

		b = 5; // REC_STR
		go.write(&b, 1);

		b = 0; // FMT_NULL
		go.write(&b, 1);

		// trk name
		len = 5;
		go.write(&len, 4);
		go.write("EVENT", 5);
	}

	while (!gi.eof()) { // 입력 파일의 모든 패킷을 복사함
		unsigned char type; if (!gi.read(&type, 1)) break;
		unsigned long datalen; if (!gi.read(&datalen, 4)) break;
		if(datalen > 1000000) break;
		if(buf.size() < datalen) buf.resize(datalen);
		if (!gi.read(&buf[0], datalen)) break; // read packet

		if (type == 0) { // trkinfo : tname, tid, dname, did, type (NUM, STR, WAV), srate
			goto next_packet2;
		} else if (type == 9) { // devinfo
			goto next_packet2;
		} else if (type == 1) { // rec
			if (datalen < 10) break;
			auto pdt = (double*)&buf[2];
			auto ptid = (unsigned short*)&buf[10];
			if (*ptid == tid_evt) continue; // skip the old event records
		}

	next_packet2:
		if (!go.write(&type, 1)) break;
		if (!go.write(&datalen, 4)) break;
		if (!go.write(&buf[0], datalen)) break;
	}

	for (auto it : evts) {
		double dt = it.first;
		string str = it.second;

		// type and datalen
		unsigned char type = 1; // SAVE_REC
		if (!go.write(&type, 1)) break;
		
		unsigned long strlen = str.size();

		unsigned long datalen = 10 + 2 + (8 + strlen);
		if (!go.write(&datalen, 4)) break;
		
		// save info
		unsigned short infolen = 10;
		if (!go.write(&infolen, 2)) break;
		if (!go.write(&dt, 8)) break;
		if (!go.write(&tid_evt, 2)) break;

		unsigned long nil = 0;
		if (!go.write(&nil, 4)) break;
		if (!go.write(&strlen, 4)) break;
		if (!go.write((void*)str.c_str(), strlen)) break;
	}

	return 0;
}