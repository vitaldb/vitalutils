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
double dt_moveto = 4102444800; // 2100�� 1�� 1�� 0��

void print_usage(const char* progname) {
	fprintf(stderr, "Deidentify vital file\n\n\
Usage : %s INPUT_PATH OUTPUT_PATH SECONDS\n\n\
INPUT_PATH: input vital file path\n\
OUTPUT_PATH: output vital file path\n\
SECONDS: relative time moves in second (if < 100000000)\n\
         unix timestamp (if > 100000000) \n\n", basename(progname).c_str());
}

int main(int argc, char* argv[]) {
	if (argc < 3) {
		print_usage(argv[0]);
		return -1;
	}
	argc--; argv++; // �ڱ� �ڽ��� ���� ���ϸ� ����

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

	int seconds = 0;
	if (argc > 2) {
		seconds = atoi(argv[2]);
		if (seconds > 100000000) {
			dt_moveto = seconds;
			seconds = 0;
		}
	}

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

	unsigned char packed = 0;
	{
		unsigned short remaining = headerlen;
		if (remaining >= 27) { // 2(tzbias) + 4(inst_id) + 4(prog_ver) + 8(dtstart) + 8(dtend) + 1(packed) = 27
			unsigned char tmp[27];
			if (!gi.read(tmp, 27)) return -1;
			packed = tmp[26];
			remaining -= 27;
		}
		if (!gi.skip(remaining)) return -1;
	}

	// 1st pass to find out dtstart
	unsigned short tid_evt = 0; // event trkid
	double dtstart = DBL_MAX;
	while (!gi.eof()) { // body is just a list of packet
		unsigned char type; if (!gi.read(&type, 1)) break;
		unsigned long datalen; if (!gi.read(&datalen, 4)) break;
		if(!packed && datalen > 1000000) break;
		if (type == 0) { // trkinfo : tname, tid, dname, did, type (NUM, STR, WAV), srate
			unsigned short tid; if (!gi.fetch(tid, datalen)) goto next_packet;
			gi.skip(2, datalen);
			string tname; if (!gi.fetch_with_len(tname, datalen)) goto next_packet;
			string unit; gi.fetch_with_len(unit, datalen);
			gi.skip(4 + 4 + 4 + 4 + 8 + 8 + 1, datalen);
			unsigned long did = 0; gi.fetch(did, datalen);
			if (did == 0 && tname == "EVENT") {
				tid_evt = tid;
			}
			goto next_packet;
		} else if (type == 9) { // devinfo
			goto next_packet;
		} else if (type == 1) { // rec
			unsigned short infolen; if (!gi.fetch(infolen, datalen)) goto next_packet;
			double dt_rec_start; if (!gi.fetch(dt_rec_start, datalen)) goto next_packet;
			if (!dt_rec_start) goto next_packet;
			if (dtstart > dt_rec_start) dtstart = dt_rec_start;
		}

next_packet:
		if (!gi.skip(datalen)) break;
	}

	vector<unsigned char> buf;

	// second pass
	gi.rewind();
	buf.resize(10 + headerlen);
	if (!gi.read(&buf[0], 10 + headerlen)) return -1; // read header
	if (!seconds) buf[10] = buf[11] = 0; // clear tzbias
	if (!go.write(&buf[0], 10 + headerlen)) return -1; // write header
	while (!gi.eof()) {
		unsigned char type; if (!gi.read(&type, 1)) break;
		unsigned long datalen; if (!gi.read(&datalen, 4)) break;
		if(!packed && datalen > 1000000) break;
		if(buf.size() < datalen) buf.resize(datalen);
		if (!gi.read(&buf[0], datalen)) break; // read packet
		if (type == 0) { // trkinfo : tname, tid, dname, did, type (NUM, STR, WAV), srate
			goto next_packet2;
		} else if (type == 9) { // devinfo
			goto next_packet2;
		} else if (type == 1) { // rec
			if (datalen < 10) break;
			double* pdt = (double*)&buf[2];
			auto ptid = (unsigned short*)& buf[10];
			if (*ptid == tid_evt) continue; // skip the old event records

			if (seconds) { // ���ð���ŭ �̵�
				*pdt += seconds;
			} else { // 2100�� 1�� 1�Ϸ� �̵�
				*pdt -= dtstart;
				*pdt += dt_moveto;
			}
		}

	next_packet2:
		if (!go.write(&type, 1)) break;
		if (!go.write(&datalen, 4)) break;
		if (!go.write(&buf[0], datalen)) break;
	}

	return 0;
}