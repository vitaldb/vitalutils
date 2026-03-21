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
	unsigned ncmds = tnames.size(); // �����Ͱ� �ֵ� ���� ������ �� �÷��� ����Ѵ�.
	vector<string> dnames(ncmds);
	vector<string> newnames(ncmds);
	vector<string> newtis(ncmds);
	for (int i = 0; i < ncmds; i++) {
		auto tname = tnames[i];

		int pos = tname.find('@');
		if (pos != -1) {// Ʈ�� ���� ����. ���� ti �� | �� ���еǾ� �Ѿ���µ� �̴� �Ʒ����� ����� �� �Ľ��Ѵ�
			newtis[i] = tname.substr(pos + 1);
			tname = tname.substr(0, pos);
		}

		pos = tname.find('=');
		if (pos != -1) {// Ʈ���� ����
			newnames[i] = tname.substr(pos + 1);
			tname = tname.substr(0, pos);
		}

		pos = tname.find('/');
		if (pos != -1) {// devname �� ����
			dnames[i] = tname.substr(0, pos);
			tname = tname.substr(pos + 1);
		}

		tnames[i] = tname;
	}
	
	GZWriter fw(argv[1]); // ���� ������ ����.
	GZReader fr(argv[0]); // ���� ������ ����.
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

	unsigned char packed = 0;
	if (headerlen >= 27) { // 2(tzbias) + 4(inst_id) + 4(prog_ver) + 8(dtstart) + 8(dtend) + 1(packed) = 27
		packed = header[26];
	}

	// �� �� ����. �ѹ��� �����鼭 ����.
	map<unsigned short, bool> tid_need_to_delete; // �� tid �� ���� ����
	map<unsigned long, string> did_dnames;
	while (!fr.eof()) { // body�� ��Ŷ�� �����̴�.
		unsigned char packet_type; if (!fr.read(&packet_type, 1)) break;
		unsigned long packet_len; if (!fr.read(&packet_len, 4)) break;
		if(!packed && packet_len > 1000000) break; // 1MB �̻��� ��Ŷ�� ����
		
		// �ϰ��� �����ؾ��ϹǷ� �ϰ��� ���� �� �ۿ� ����
		BUF buf(packet_len);
		if (!fr.read(&buf[0], packet_len)) break;

		// tname, tid, dname, did, type (NUM, STR, WAV), srate
		bool need_to_save = true;
		if (packet_type == 0) { // trkinfo
			unsigned short tid; if (!buf.fetch(tid)) goto next_packet;
			buf.skip(2);
			string tname; if (!buf.fetch_with_len(tname)) goto next_packet;
			
			// ������ Ʈ�� ������ �޾ƿ�. ������ ���޾ƿ´�
			string unit; float mindisp = 0.0f, maxdisp = 100.0f, srate = 100.0f;
			unsigned char color_a = 255, color_r = 255, color_g = 255, color_b = 255, montype = 0;
			double gain = 1.0, offset = 0.0;

			buf.fetch_with_len(unit);
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

			bool need_to_delete = false; // �ش� Ʈ���� ���� ������ �� ���̹Ƿ� 
			for (int i = 0; i < ncmds; i++) {
				if (tnames[i] == "*" || tnames[i] == tname) {
					if (dnames[i].empty() || dnames[i] == dname || dnames[i] == "*") { // Ʈ���� ��Ī ��
						need_to_save = false; // �����ϰų� �����ϸ� ���⼭ ���ű� ������ �Ʒ����� ���� ����� ��

						auto newname = newnames[i];
						auto newti = newtis[i];
						auto newunit = unit;
						if (!newname.empty() || !newti.empty()) { // Ʈ���� Ȥ�� Ʈ�� ���� ����
							if (!newti.empty()) {
								// newti ��¡�ϰ� ���
								auto ti = explode(newti, "|");
								// unit, mindisp, maxdisp, r, g, b, gain, offset, montype ����
								// ���ڰ����� ���̸� ��ü ����
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

							// Ʈ���� ���� ������ ��
							unsigned long old_packet_written = 4;
							fw.write(&buf[0], 4);

							// �� Ʈ������ ��
							old_packet_written += 4 + tname.size();
							if (newname.empty()) newname = tname; // Ʈ�� ������ ������ ���
							fw.write_with_len(newname);

							old_packet_written += 4 + unit.size();
							fw.write_with_len(newunit);

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

							// �������� �� (����� did��)
							fw.write(&buf[old_packet_written], packet_len - old_packet_written);

							need_to_delete = false;
						} else { // �̸��� ��Ī�Ǵµ� newname�� ���� newti�� ������ �̴� ������
							need_to_delete = true;
						}
						break; // �ѹ� ��Ī�Ǹ� ���� Ʈ���� �˻����� ����
					}
				}
			}
			tid_need_to_delete[tid] = need_to_delete;
		} else if (packet_type == 9) { // devinfo
			unsigned long did; if (!buf.fetch(did)) goto next_packet;
			string dtype; if (!buf.fetch_with_len(dtype)) goto next_packet;
			string dname; if (!buf.fetch_with_len(dname)) goto next_packet;
			if (dname.empty()) dname = dtype;
			did_dnames[did] = dname;
		} else if (packet_type == 1) { // rec
			buf.skip(2 + 8); // infolen, dt_rec_start
			unsigned short tid; if (!buf.fetch(tid)) goto next_packet;
			need_to_save = !tid_need_to_delete[tid];
		}

next_packet:
		if (need_to_save) { // ���� ��Ŷ�� ������
			fw.write(&packet_type, 1);
			fw.write(&packet_len, 4);
			fw.write(&buf[0], packet_len);
		}
	}
	return 0;
}