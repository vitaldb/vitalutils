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

	GZReader fr(ipath.c_str()); // ���� ������ ����.
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

	unsigned char packed = 0;
	if (headerlen >= 27) { // 2(tzbias) + 4(inst_id) + 4(prog_ver) + 8(dtstart) + 8(dtend) + 1(packed) = 27
		packed = header[10 + 26];
	}

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

	// �� �� ����. �ѹ��� �а� Ʈ������ ������ ����.
	while (!fr.eof()) { // body�� ��Ŷ�� �����̴�.
		unsigned char packet_type; if (!fr.read(&packet_type, 1)) break;
		unsigned long packet_len; if (!fr.read(&packet_len, 4)) break;
		if(!packed && packet_len > 1000000) break; // 1MB �̻��� ��Ŷ�� ����

		BUF packet_header(5);
		packet_header[0] = packet_type;
		memcpy(&packet_header[1], &packet_len, 4);
		
		// �ϰ��� �����ؾ��ϹǷ� �ϰ��� ���� �� �ۿ� ����
		BUF buf(packet_len);
		if (!fr.read(&buf[0], packet_len)) break;
		if (packet_type == 9) { // devinfo
			unsigned long did = 0; if (!buf.fetch(did)) continue;
			string dtype; if (!buf.fetch_with_len(dtype)) continue;
			string dname; if (!buf.fetch_with_len(dname)) continue;
			if (dname.empty()) dname = dtype;
			did_dname[did] = dname;
			
			auto& headerbuf = did_di[did];
			headerbuf.insert(headerbuf.end(), packet_header.begin(), packet_header.end());
			headerbuf.insert(headerbuf.end(), buf.begin(), buf.end());
		} else if (packet_type == 0) { // trkinfo
			unsigned short tid; if (!buf.fetch(tid)) continue;
			buf.skip(2);
			string tname; if (!buf.fetch_with_len(tname)) continue;
			string tunit; buf.fetch_with_len(tunit);
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

	// ��� ������ ����.
	for (auto& it : tid_recs) {
		auto tid = it.first;
		auto did = tid_did[tid];
		// if (!did) continue; // did�� ��� EVENT Ʈ���� ������ �Ǿ����

		auto dname = did_dname[did];
		auto tname = tid_tname[tid];

		string opath = argv[1];
		opath += "/";
		opath += progname + "^" + dname + "^" + tname + ".dat";

		FILE* fw = fopen(opath.c_str(), "wb"); // ���� ������ ����.
		if (!fw) continue;

		if (did) { // ��������� ����.
			auto& recs = did_di[did];
			fwrite(&recs[0], 1, recs.size(), fw);
		}
		{ // Ʈ�� ������ ����.
			auto& recs = tid_ti[tid];
			fwrite(&recs[0], 1, recs.size(), fw);
		}
		{ // ���ڵ带 ����.
			auto& recs = it.second;
			fwrite(&recs[0], 1, recs.size(), fw);
		}
		fclose(fw);
	}

	return 0;
}