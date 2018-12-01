#include <stdio.h>
#include <stdlib.h>  // exit()
#include <stdio.h>
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
#include <direct.h>
using namespace std;

void print_usage(const char* progname) {
	fprintf(stderr, "Split vital file into binary header and track files.\n\n\
Output filenames are INPUT_FILENAME^HEADER, INPUT_FILENAME^DEV_NAME^TRK_NAME\n\n\
Usage : %s INPUT_PATH OUTPUT_DIR\n\n\
INPUT_PATH : vital file path\n\
OUTPUT_DIR : output directory. if it does not exist, it will be created.\n\n", basename(progname).c_str());
}

int main(int argc, char* argv[]) {
	if (argc < 3) {
		print_usage(argv[0]);
		return -1;
	}
	argc--; argv++;

	string ipath = argv[0];
	string progname = basename(argv[0]);
	mkdir(argv[1]);

	GZReader fr(ipath.c_str()); // 읽을 파일을 연다.
	if (!fr.opened()) {
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

	string opath = argv[1];
	opath += "/";
	opath += progname + "^HEADER";
	FILE* fw = fopen(opath.c_str(), "wb");
	if (!fw) return -1;
	fwrite(&header[0], 1, header.size(), fw);
	fclose(fw);

	map<unsigned long, string> did_dname;
	map<unsigned long, BUF> did_di;
	map<unsigned short, string> tid_tname;
	map<unsigned short, BUF> tid_ti;
	map<unsigned short, unsigned long> tid_did;
	map<unsigned short, BUF> tid_recs;

	// 한 번 훑음. 한번에 읽고 트랙별로 나눠서 쓴다.
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
			
			auto& headerbuf = did_di[did];
			headerbuf.insert(headerbuf.end(), packet_header.begin(), packet_header.end());
			headerbuf.insert(headerbuf.end(), buf.begin(), buf.end());
		} else if (packet_type == 0) { // trkinfo
			unsigned short tid; if (!buf.fetch(tid)) continue;
			buf.skip(2);
			string tname; if (!buf.fetch(tname)) continue;
			string tunit; buf.fetch(tunit);
			buf.skip(33);
			unsigned long did = 0; buf.fetch(did);

			tid_did[tid] = did;
			tid_tname[tid] = tname;

			auto& headerbuf = tid_ti[tid];
			headerbuf.insert(headerbuf.end(), packet_header.begin(), packet_header.end());
			headerbuf.insert(headerbuf.end(), buf.begin(), buf.end());
		} else if (packet_type == 1) { // rec
			buf.skip(10);
			unsigned short tid; if (!buf.fetch(tid)) continue;

			auto& headerbuf = tid_recs[tid];
			headerbuf.insert(headerbuf.end(), packet_header.begin(), packet_header.end());
			headerbuf.insert(headerbuf.end(), buf.begin(), buf.end());
		}
	}

	// 모든 내용을 쓴다.
	for (auto& it : tid_recs) {
		auto tid = it.first;
		auto did = tid_did[tid];
		// if (!did) continue; // did가 없어도 EVENT 트랙은 추출이 되어야함

		auto dname = did_dname[did];
		auto tname = tid_tname[tid];

		string opath = argv[1];
		opath += "/";
		opath += progname + "^" + dname + "^" + tname + ".dat";

		FILE* fw = fopen(opath.c_str(), "wb"); // 쓰기 파일을 연다.
		if (!fw) continue;

		if (did) { // 장비정보를 쓴다.
			auto& recs = did_di[did];
			fwrite(&recs[0], 1, recs.size(), fw);
		}
		{ // 트랙 정보를 쓴다.
			auto& recs = tid_ti[tid];
			fwrite(&recs[0], 1, recs.size(), fw);
		}
		{ // 레코드를 쓴다.
			auto& recs = it.second;
			fwrite(&recs[0], 1, recs.size(), fw);
		}
		fclose(fw);
	}

	return 0;
}