#include <stdio.h>
#include <stdlib.h>  // exit()
#include <stdio.h>
#include <assert.h>
#include <zlib.h>
#include <string>
#include <vector>
#include <map>
#include <set>
#include <stdarg.h>  // For va_start, etc.
#include <memory>    // For std::unique_ptr
#include <time.h> 
#include "GZReader.h"
#include "Util.h"
#include <direct.h>
using namespace std;

void print_usage(const char* progname) {
	fprintf(stderr, "Copy tracks from vital file into another vital file.\n\n\
Usage : %s INPUT_PATH OUTPUT_PATH [DNAME/TNAME]\n\n\
INPUT_PATH: vital file path\n\
OUTPUT_DIR: output file path\n\
DEVNAME/TRKNAME : comma seperated device and track name list. ex) BIS/BIS,BIS/SEF\n\
if omitted, all tracks are copyed.\n\n", basename(progname).c_str());
}

int main(int argc, char* argv[]) {
	if (argc < 3) {
		print_usage(argv[0]);
		return -1;
	}
	argc--; argv++;

	string ipath = argv[0];
	string opath = argv[1];
	if (argc == 2) { // 단순 복사
		FILE* fr = fopen(ipath.c_str(), "rb");
		if (!fr) {
			fprintf(stderr, "file open error\n");
			return -1;
		}
		FILE* fw = fopen(opath.c_str(), "wb");
		if (!fw) {
			fprintf(stderr, "file open error\n");
			return -1;
		}
		fseek(fr, 0, SEEK_END);
		auto filesize = ftell(fr);
		rewind(fr);
		auto buf = (char*)malloc(filesize);
		fread(buf, filesize, 1, fr);
		fwrite(buf, filesize, 1, fw);
		free(buf);
		fclose(fr);
		fclose(fw);
		return 0;
	}

	////////////////////////////////////////////////////////////
	// parse dname/tname
	////////////////////////////////////////////////////////////
	vector<string> tnames; // 출력할 트랙명
	vector<string> dnames; // 출력할 장비명
	set<unsigned short> tids; // 출력할 tid

	bool alltrack = true;
	if (argc >= 3) {
		alltrack = false;
		tnames = explode(argv[2], ',');
		int ncols = tnames.size();
		dnames.resize(ncols);
		for (int j = 0; j < ncols; j++) {
			int pos = tnames[j].find('/');
			if (pos != -1) {// devname, tname으로 분리
				dnames[j] = tnames[j].substr(0, pos);
				tnames[j] = tnames[j].substr(pos + 1);
			}
		}
	}

	GZWriter fw(argv[1]); // 쓰기 파일을 연다.
	GZReader fr(argv[0]); // 읽을 파일을 연다.
	if (!fr.opened() || !fw.opened()) {
		fprintf(stderr, "file open error\n");
		return -1;
	}

	// header
	BUF header(10);

	char sign[4];
	if (!fr.read(sign, 4)) return -1;
	if (strncmp(sign, "VITA", 4) != 0) {
		fprintf(stderr, "file does not seem to be a vital file\n");
		return -1;
	}
	memcpy(&header[0], sign, 4);

	char ver[4];
	if (!fr.read(ver, 4)) return -1; // version
	memcpy(&header[4], ver, 4);

	unsigned short headerlen; // header length
	if (!fr.read(&headerlen, 2)) return -1;
	memcpy(&header[8], &headerlen, 2);

	header.resize(10 + headerlen);
	if (!fr.read(&header[10], headerlen)) return -1;

	fw.write(&header[0], header.size());
	
	map<unsigned long, string> did_dname;
	map<unsigned long, BUF> did_di;
	map<unsigned short, string> tid_tname;
	map<unsigned short, BUF> tid_ti;
	map<unsigned short, unsigned long> tid_did;
	map<unsigned short, BUF> tid_recs;

	// 한 번에 읽으면서 쓴다.
	while (!fr.eof()) { // body는 패킷의 연속이다.
		unsigned char packet_type; if (!fr.read(&packet_type, 1)) break;
		unsigned long packet_len; if (!fr.read(&packet_len, 4)) break;
		if(packet_len > 1000000) break; // 1MB 이상의 패킷은 버림

		BUF packet_header(5);
		packet_header[0] = packet_type;
		memcpy(&packet_header[1], &packet_len, 4);
		
		// 일괄로 복사해야하므로 일괄로 읽을 수 밖에 없음
		BUF buf(packet_len);
		if (!fr.read(&buf[0], packet_len)) break;
		if (packet_type == 9) { // devinfo
			unsigned long did = 0; if (!buf.fetch(did)) continue;
			string dtype; if (!buf.fetch(dtype)) continue;
			string dname; if (!buf.fetch(dname)) continue;
			if (dname.empty()) dname = dtype;
			did_dname[did] = dname;
		} else if (packet_type == 0) { // trkinfo
			unsigned short tid; if (!buf.fetch(tid)) continue;
			buf.skip(2);
			string tname; if (!buf.fetch(tname)) continue;
			string tunit; buf.fetch(tunit);
			buf.skip(33);
			unsigned long did = 0; buf.fetch(did);

			tid_did[tid] = did;
			tid_tname[tid] = tname;
			auto dname = did_dname[did];

			bool matched = false;
			for (int i = 0; i < tnames.size(); i++) {
				if (tnames[i] == "*" || tnames[i] == tname) {
					if (dnames[i].empty() || dnames[i] == dname || dnames[i] == "*") {// 트랙명 매칭 됨
						tids.insert(tid);
						matched = true;
						break;
					}
				}
			}
			if (!matched) continue;
		} else if (packet_type == 1) { // rec
			buf.skip(10);
			unsigned short tid; if (!buf.fetch(tid)) continue;
			
			if (tids.find(tid) == tids.end()) continue; // 생략할 레코드
		} 
		
		// 그 외 패킷
		fw.write(&packet_header[0], packet_header.size());
		fw.write(&buf[0], buf.size());
	}

	return 0;
}