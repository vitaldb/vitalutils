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
	printf("Remove or rename track(s) from vital file\n\
\n\
Usage : %s INPUT_PATH OUTPUT_PATH DEV1/TRK1=NEW1,DEV2/TRK2=NEW2,...\n\n\
INPUT_PATH : vital file path\n\
OUTPUT_PATH : output file path\n\
DEVn/TRKn=NEWNAMEn : comma seperated device name / track name = new name list.\n\
\n\
if track matched more than twice, only the first specifier will be applied.\n\
if 'DEVn/' is omitted or *, only the track name will be checked.\n\
if '=NEWNAMEn' is specified, the track will be renamed.\n\
if '=NEWNAMEn' is omitted, the track will be removed.\n\
\n\
Examples\n\n\
vital_edit_trks a.vital b.vital CO,CI\n\
-> removal all track named with 'CO' or 'CI'\n\n\
vital_edit_trks a.vital b.vital \"CO=Cardiac Output\" \n\
-> rename all 'CO' track to 'Cardiac Output'\n\n\
vital_edit_trks a.vital b.vital BIS/* \n\
-> remove all track from 'BIS' device\n\n\
vital_edit_trks a.vital b.vital \"SNUADC/ART1=FEM,SNUADC/RESP\"\n\
-> rename 'SNUADC' device's 'ART1' track to 'FEM' and delete 'RESP' track\n\n\
", basename(progname).c_str());
}

int main(int argc, char* argv[]) {
	if (argc < 4) {
		print_usage(argv[0]);
		return -1;
	}
	argc--; argv++;

	////////////////////////////////////////////////////////////
	// parse dname/tname/newname
	////////////////////////////////////////////////////////////
	vector<string>& tnames = explode(argv[2], ',');
	unsigned ncols = tnames.size(); // 데이터가 있든 없든 무조건 이 컬럼을 출력한다.
	vector<string> dnames(ncols);
	vector<string> newnames(ncols);
	for (int i = 0; i < ncols; i++) {
		auto tname = tnames[i];
		
		int newpos = tname.find('=');
		if (newpos != -1) {
			newnames[i] = tname.substr(newpos + 1);
			tnames[i] = tname = tname.substr(0, newpos);
		}

		int pos = tname.find('/');
		if (pos != -1) {// devname 을 지정
			dnames[i] = tname.substr(0, pos);
			tnames[i] = tname = tname.substr(pos + 1, newpos - pos - 1);
		}
	}
	
	GZWriter fw(argv[1]); // 쓰기 파일을 연다.
	GZReader fr(argv[0]); // 읽을 파일을 연다.
	if (!fr.opened() || !fw.opened()) {
		fprintf(stderr, "file open error\n");
		return -1;
	}

	// header
	char sign[4];
	if (!fr.read(sign, 4)) return -1;
	if (strncmp(sign, "VITA", 4) != 0) {
		fprintf(stderr, "file does not seem to be a vital file\n");
		return -1;
	}
	if (!fw.write(sign, 4)) return -1;

	char ver[4];
	if (!fr.read(ver, 4)) return -1; // version
	if (!fw.write(ver, 4)) return -1;

	unsigned short headerlen; // header length
	if (!fr.read(&headerlen, 2)) return -1;
	if (!fw.write(&headerlen, 2)) return -1;

	BUF header(headerlen);
	if (!fr.read(&header[0], headerlen)) return -1;
	if (!fw.write(&header[0], headerlen)) return -1;

	// 한 번 훑음. 한번에 읽으면서 쓴다.
	map<unsigned short, bool> tid_use; // 각 tid 별 저장 여부
	map<unsigned long, string> did_dnames;
	while (!fr.eof()) { // body는 패킷의 연속이다.
		unsigned char packet_type; if (!fr.read(&packet_type, 1)) break;
		unsigned long packet_len; if (!fr.read(&packet_len, 4)) break;
		if(packet_len > 1000000) break; // 1MB 이상의 패킷은 버림
		
		// 일괄로 복사해야하므로 일괄로 읽을 수 밖에 없음
		BUF buf(packet_len);
		if (!fr.read(&buf[0], packet_len)) break;

		// tname, tid, dname, did, type (NUM, STR, WAV), srate
		bool need_to_write = true;
		if (packet_type == 0) { // trkinfo
			unsigned short tid; if (!buf.fetch(tid)) goto next_packet;
			buf.skip(2);
			string tname; if (!buf.fetch(tname)) goto next_packet;
			
			// 트랙명 이후는 없을 수 도 있음
			string unit, dname;
			unsigned long did = 0;
			if (!buf.fetch(unit)) goto save_and_next_packet;
			buf.skip(4 + 4 + 4 + 4 + 8 + 8 + 1);
			if (!buf.fetch(did)) goto save_and_next_packet;
			dname = did_dnames[did];

save_and_next_packet:
			bool use = true; // 삭제 또는 변경
			for (int i = 0; i < ncols; i++) {
				if (tnames[i] == "*" || tnames[i] == tname) {
					if (dnames[i].empty() || dnames[i] == dname || dnames[i] == "*") { // 트랙명 매칭 됨
						need_to_write = false; // 삭제하든 이름 변경하든 아래에서 쓰지 않음

						auto newname = newnames[i];
						if (!newname.empty()) { // 트랙 이름 변경
							unsigned long new_packet_len = packet_len - tname.size() + newname.size();

							fw.write(&packet_type, 1);
							fw.write(&new_packet_len, 4);

							// 트랙명 이전 정보를 씀
							fw.write(&buf[0], 4);

							// 새 트랙명을 씀
							unsigned long newname_len = newname.size();
							fw.write(&newname_len, 4);
							fw.write(&newname[0], newname_len);

							// 나머지를 씀
							unsigned long remain_pos = 4 + 4 + tname.size();
							fw.write(&buf[remain_pos], packet_len - remain_pos);
							
							use = true;
						} else {
							use = false;
						}
						break; // 매칭되면 뒤의 트랙은 검사하지 않음
					}
				}
			}
			tid_use[tid] = use;
		} else if (packet_type == 9) { // devinfo
			unsigned long did; if (!buf.fetch(did)) goto next_packet;
			string dtype; if (!buf.fetch(dtype)) goto next_packet;
			string dname; if (!buf.fetch(dname)) goto next_packet;
			if (dname.empty()) dname = dtype;
			did_dnames[did] = dname;
		} else if (packet_type == 1) { // rec
			buf.skip(2 + 8); // infolen, dt_rec_start
			unsigned short tid; if (!buf.fetch(tid)) goto next_packet;
			need_to_write = tid_use[tid];
		}

next_packet:
		if (need_to_write) { // 현재 패킷을 저장함
			fw.write(&packet_type, 1);
			fw.write(&packet_len, 4);
			fw.write(&buf[0], packet_len);
		}
	}
	return 0;
}