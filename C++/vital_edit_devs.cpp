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
	printf("Rename device name in vital file\n\n\
Usage : %s INPUT_PATH OUTPUT_PATH DEVNAME_FROM DEVNAME_TO\n\n\
INPUT_PATH : vital file name\n\
OUTPUT_PATH : output file name\n\
DEVNAME_FROM : old device name\n\
DEVNAME_TO : new device name\n\n", basename(progname).c_str());
}

int main(int argc, char* argv[]) {
	if (argc < 5) {
		print_usage(argv[0]);
		return -1;
	}
	argc--; argv++; // �ڱ� �ڽ��� ���� ���ϸ� ����

	string devfrom = argv[2];
	string devto = argv[3];

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
	while (!fr.eof()) { // body�� ��Ŷ�� �����̴�.
		unsigned char packet_type; if (!fr.read(&packet_type, 1)) break;
		unsigned long packet_len; if (!fr.read(&packet_len, 4)) break;
		if(!packed && packet_len > 1000000) break; // 1MB �̻��� ��Ŷ�� ����
		
		// �ϰ��� �����ؾ��ϹǷ� �ϰ��� ���� �� �ۿ� ����
		BUF buf(packet_len);
		if (!fr.read(&buf[0], packet_len)) break;
		if (packet_type == 9) { // devinfo
			unsigned long did; if (!buf.fetch(did)) continue;
			string dtype; if (!buf.fetch_with_len(dtype)) continue;
			string dname; if (!buf.fetch_with_len(dname)) continue;
			if (dname.empty()) dname = dtype;
			if (dname == devfrom) {
				unsigned long new_packet_len = packet_len - devfrom.size() + devto.size();
				fw.write(&packet_type, 1);
				fw.write(&new_packet_len, 4);
				
				// ���� ���� ������ ��
				fw.write(&did, sizeof(did));

				unsigned long dtype_len = dtype.size();
				fw.write(&dtype_len, 4);
				fw.write(&dtype[0], dtype_len);
				
				// �� ������ ��
				unsigned long devto_len = devto.size();
				fw.write(&devto_len, 4);
				fw.write(&devto[0], devto_len);
				
				// �������� ��
				unsigned long remain_pos = 4 + 8 + dtype_len + devfrom.size();
				fw.write(&buf[remain_pos], packet_len - remain_pos);
			} else {
				fw.write(&packet_type, 1);
				fw.write(&packet_len, 4);
				fw.write(&buf[0], packet_len);
			}
		} else { // �������� �׳� ����
			fw.write(&packet_type, 1);
			fw.write(&packet_len, 4);
			fw.write(&buf[0], packet_len);
		}
	}
	return 0;
}