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
	vector<string> tnames = explode(argv[2], ',');
	unsigned ncmds = tnames.size(); // 데이터가 있든 없든 무조건 이 컬럼을 출력한다.
	vector<string> dnames(ncmds);
	vector<string> newnames(ncmds);
	vector<string> newtis(ncmds);
	for (int i = 0; i < ncmds; i++) {
		auto tname = tnames[i];

		int pos = tname.find('@');
		if (pos != -1) {// 트랙 정보 변경. 실제 ti 는 | 로 구분되어 넘어오는데 이는 아래에서 사용할 때 파싱한다
			newtis[i] = tname.substr(pos + 1);
			tname = tname.substr(0, pos);
		}

		pos = tname.find('=');
		if (pos != -1) {// 트랙명 변경
			newnames[i] = tname.substr(pos + 1);
			tname = tname.substr(0, pos);
		}

		pos = tname.find('/');
		if (pos != -1) {// devname 을 지정
			dnames[i] = tname.substr(0, pos);
			tname = tname.substr(pos + 1);
		}

		tnames[i] = tname;
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
	map<unsigned short, bool> tid_need_to_delete; // 각 tid 별 저장 여부
	map<unsigned long, string> did_dnames;
	while (!fr.eof()) { // body는 패킷의 연속이다.
		unsigned char packet_type; if (!fr.read(&packet_type, 1)) break;
		unsigned long packet_len; if (!fr.read(&packet_len, 4)) break;
		if(packet_len > 1000000) break; // 1MB 이상의 패킷은 버림
		
		// 일괄로 복사해야하므로 일괄로 읽을 수 밖에 없음
		BUF buf(packet_len);
		if (!fr.read(&buf[0], packet_len)) break;

		// tname, tid, dname, did, type (NUM, STR, WAV), srate
		bool need_to_save = true;
		if (packet_type == 0) { // trkinfo
			unsigned short tid; if (!buf.fetch(tid)) goto next_packet;
			buf.skip(2);
			string tname; if (!buf.fetch(tname)) goto next_packet;
			
			// 기존의 트랙 정보를 받아옴. 없으면 못받아온다
			string unit; float mindisp = 0.0f, maxdisp = 100.0f, srate = 100.0f;
			unsigned char color_a = 255, color_r = 255, color_g = 255, color_b = 255, montype = 0;
			double gain = 1.0, offset = 0.0;

			buf.fetch(unit);
			buf.fetch(mindisp);
			buf.fetch(maxdisp);
			buf.fetch(color_b);
			buf.fetch(color_g);
			buf.fetch(color_r);
			buf.fetch(color_a);
			buf.fetch(srate);
			buf.fetch(gain);
			buf.fetch(offset);
			buf.fetch(montype);

			unsigned long did = 0; 
			buf.fetch(did);
			auto dname = did_dnames[did];

			bool need_to_delete = false; // 해당 트랙에 대한 삭제가 될 것이므로 
			for (int i = 0; i < ncmds; i++) {
				if (tnames[i] == "*" || tnames[i] == tname) {
					if (dnames[i].empty() || dnames[i] == dname || dnames[i] == "*") { // 트랙명 매칭 됨
						need_to_save = false; // 삭제하거나 변경하면 여기서 쓸거기 때문에 아래에서 쓰지 말라는 뜻

						auto newname = newnames[i];
						auto newti = newtis[i];
						auto newunit = unit;
						if (!newname.empty() || !newti.empty()) { // 트랙명 혹은 트랙 정보 변경
							if (!newti.empty()) {
								// newti 파징하고 덮어씀
								auto ti = explode(newti, "|");
								// unit, mindisp, maxdisp, r, g, b, gain, offset, montype 순서
								// 숫자값들은 빈값이면 교체 안함
								if (ti.size() > 0) {
									newunit = ti[0];
								}
								if (ti.size() > 1) {
									auto& s = ti[1];
									if (!s.empty()) mindisp = atof(s.c_str());
								}
								if (ti.size() > 2) {
									auto& s = ti[2];
									if (!s.empty()) maxdisp = atof(s.c_str());
								}
								if (ti.size() > 5) {
									auto s = ti[3];
									if (!s.empty()) color_r = atoi(s.c_str());
									s = ti[4];
									if (!s.empty()) color_g = atoi(s.c_str());
									s = ti[5];
									if (!s.empty()) color_b = atoi(s.c_str());
								}
								if (ti.size() > 6) {
									auto& s = ti[6];
									if (!s.empty()) gain = atof(s.c_str());
								}
								if (ti.size() > 7) {
									auto& s = ti[7];
									if (!s.empty()) offset = atof(s.c_str());
								}
								if (ti.size() > 8) {
									auto& s = ti[8];
									if (!s.empty()) montype = atof(s.c_str());
								}
							}

							unsigned long new_packet_len = packet_len - tname.size() + newname.size() - unit.size() + newunit.size();

							fw.write(&packet_type, 1);
							fw.write(&new_packet_len, 4);

							// 트랙명 이전 정보를 씀
							unsigned long old_packet_written = 4;
							fw.write(&buf[0], 4);

							// 새 트랙명을 씀
							old_packet_written += 4 + tname.size();
							if (newname.empty()) newname = tname; // 트랙 정보만 변경할 경우
							fw.write(newname);

							old_packet_written += 4 + unit.size();
							fw.write(newunit);

							old_packet_written += 4;
							fw.write(mindisp);

							old_packet_written += 4;
							fw.write(maxdisp);

							old_packet_written += 4;
							fw.write(color_b);
							fw.write(color_g);
							fw.write(color_r);
							fw.write(color_a);

							old_packet_written += 12;
							fw.write(srate);
							fw.write(gain);

							old_packet_written += 8;
							fw.write(offset);

							old_packet_written += 1;
							fw.write(montype);

							// 나머지를 씀 (현재는 did만)
							fw.write(&buf[old_packet_written], packet_len - old_packet_written);

							need_to_delete = false;
						} else { // 이름이 매칭되는데 newname도 없고 newti도 없으면 이는 삭제임
							need_to_delete = true;
						}
						break; // 한번 매칭되면 뒤의 트랙은 검사하지 않음
					}
				}
			}
			tid_need_to_delete[tid] = need_to_delete;
		} else if (packet_type == 9) { // devinfo
			unsigned long did; if (!buf.fetch(did)) goto next_packet;
			string dtype; if (!buf.fetch(dtype)) goto next_packet;
			string dname; if (!buf.fetch(dname)) goto next_packet;
			if (dname.empty()) dname = dtype;
			did_dnames[did] = dname;
		} else if (packet_type == 1) { // rec
			buf.skip(2 + 8); // infolen, dt_rec_start
			unsigned short tid; if (!buf.fetch(tid)) goto next_packet;
			need_to_save = !tid_need_to_delete[tid];
		}

next_packet:
		if (need_to_save) { // 현재 패킷을 저장함
			fw.write(&packet_type, 1);
			fw.write(&packet_len, 4);
			fw.write(&buf[0], packet_len);
		}
	}
	return 0;
}