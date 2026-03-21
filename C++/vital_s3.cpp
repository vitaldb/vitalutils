#include <stdio.h>
#include <stdlib.h>  // exit()
#include <assert.h>
#include "zlib128/zlib.h"
#include <string>
#include <vector>
#include <map>
#include <stdarg.h>  // For va_start, etc.
#include <memory>    // For std::unique_ptr
#include <time.h>
#include <set> 
#include <iostream>
#include "GZReader.h"
#include "Util.h"
#include <limits.h>
#include <filesystem>
#include <random>

namespace fs = std::filesystem;
using namespace std;

// s3�� �ø� �� �ֵ��� ������ �ɰ���
int main(int argc, char* argv[]) {
	if (argc < 2) { // �ּ� �Է� ������ �־����
		fprintf(stderr, "Usage : %s INPUT_FILENAME [OUTPUT_FOLDER]\n\n", argv[0]);
		return -1;
	}

	auto ipath = basename(argv[1]);

	string odir;
	if (argc > 2) { // ��� ���� ���� ��
		odir = string(argv[2]);
		if (odir.substr(odir.size() - 1) != "/") odir += "/";
	}
	else { // ��� ���� ������ �� ���ϸ�����
		odir = ipath;
	}

	fs::create_directories(odir);

	GZReader gz(argv[1]); // ������ ����
	if (!gz.opened()) {
		fprintf(stderr, "file does not exists\n");
		return -1;
	}

	// header
	char sign[4];
	if (!gz.read(sign, 4)) return -1;
	if (strncmp(sign, "VITA", 4) != 0) {
		fprintf(stderr, "file does not seem to be a vital file\n");
		return -1;
	}
	if (!gz.skip(4)) return -1; // version

	unsigned short headerlen; // header length
	if (!gz.read(&headerlen, 2)) return -1;

	short dgmt = 0;
	unsigned char packed = 0;
	if (headerlen >= 2) {
		if (!gz.read(&dgmt, sizeof(dgmt))) return -1;
		headerlen -= 2;
	}
	if (headerlen >= 25) { // 4(inst_id) + 4(prog_ver) + 8(dtstart) + 8(dtend) + 1(packed) = 25
		unsigned char tmp[25];
		if (!gz.read(tmp, 25)) return -1;
		packed = tmp[24];
		headerlen -= 25;
	}

	if (!gz.skip(headerlen)) return -1;
	headerlen += 27; // �Ʒ����� ���� �ϱ� ����

	// �� �� �����鼭 Ʈ�� �̸�, ���� �ð�, ���� �ð� ����
	map<unsigned long, string> did_dnames;
	map<unsigned short, char> tid_rectypes; // N,S,W
	map<unsigned short, unsigned char> tid_recfmts;
	map<unsigned short, double> tid_gains;
	map<unsigned short, double> tid_biases;
	map<unsigned short, double> tid_srates;

	map<unsigned short, string> tid_units;
	map<unsigned short, unsigned long> tid_samples;
	map<unsigned short, float> tid_mindisps;
	map<unsigned short, float> tid_maxdisps;
	map<unsigned short, unsigned long> tid_colors;
	map<unsigned short, unsigned char> tid_montypes;

	map<unsigned short, string> tid_dnames; // ��ġ��
	map<unsigned short, string> tid_tnames; // Ʈ����
	set<unsigned short> tids; // ���� ����ϴ� tid ���

	// �� case�� dtstart
	double dtstart = DBL_MAX;
	double dtend = 0;

	unsigned short infolen = 0;
	double dtrec = 0;
	unsigned short tid = 0;

	while (!gz.eof()) { // body�� ��Ŷ�� �����̴�.
		unsigned char type = 0;
		if (!gz.read(&type, 1)) break;
		unsigned long datalen = 0;
		if (!gz.read(&datalen, 4)) break;
		if (!packed && datalen > 1000000) break;

		// tname, tid, dname, did, type (NUM, STR, WAV), srate
		if (type == 0) { // trkinfo
			unsigned short tid = 0; if (!gz.fetch(tid, datalen)) goto next_packet;
			unsigned char rectype = 0; if (!gz.fetch(rectype, datalen)) goto next_packet;
			unsigned char recfmt; if (!gz.fetch(recfmt, datalen)) goto next_packet;
			string tname, unit;
			float mindisp = 0, maxdisp = 0, srate = 0;
			unsigned long col, did = 0;
			double gain = 1, bias = 0;
			unsigned char montype;
			if (!gz.fetch_with_len(tname, datalen)) goto save_and_next_packet;
			if (!gz.fetch_with_len(unit, datalen)) goto save_and_next_packet;
			if (!gz.fetch(mindisp, datalen)) goto save_and_next_packet;
			if (!gz.fetch(maxdisp, datalen)) goto save_and_next_packet;
			if (!gz.fetch(col, datalen)) goto save_and_next_packet;
			if (!gz.fetch(srate, datalen)) goto save_and_next_packet;
			if (!gz.fetch(gain, datalen)) goto save_and_next_packet;
			if (!gz.fetch(bias, datalen)) goto save_and_next_packet;
			if (!gz.fetch(montype, datalen)) goto save_and_next_packet;
			if (!gz.fetch(did, datalen)) goto save_and_next_packet;

		save_and_next_packet:
			string dname = did_dnames[did];
			tid_dnames[tid] = dname;
			tid_tnames[tid] = tname;

			// 1:wav,2:num,5:str
			if (rectype == 1) tid_rectypes[tid] = 'W';
			else if (rectype == 2) tid_rectypes[tid] = 'N';
			else if (rectype == 5) tid_rectypes[tid] = 'S';

			tid_units[tid] = unit;
			tid_colors[tid] = col;
			tid_mindisps[tid] = mindisp;
			tid_maxdisps[tid] = maxdisp;

			tid_recfmts[tid] = recfmt;
			tid_gains[tid] = gain;
			tid_biases[tid] = bias;
			tid_srates[tid] = srate;
			tid_montypes[tid] = montype;
			tid_samples[tid] = 0;
		}

		if (type == 9) { // devinfo
			unsigned long did; if (!gz.fetch(did, datalen)) goto next_packet;
			string dtype; if (!gz.fetch_with_len(dtype, datalen)) goto next_packet;
			string dname; if (!gz.fetch_with_len(dname, datalen)) goto next_packet;
			if (dname.empty()) dname = dtype;
			did_dnames[did] = dname;
		}
		else if (type == 1) { // rec
			unsigned short infolen = 0; if (!gz.fetch(infolen, datalen)) goto next_packet;
			double dtrec = 0; if (!gz.fetch(dtrec, datalen)) goto next_packet;
			if (!dtrec) goto next_packet;
			unsigned short tid = 0; if (!gz.fetch(tid, datalen)) goto next_packet;

			// Ʈ�� �Ӽ��� ������
			unsigned long nsamp = 0;
			double dt_rec_end = dtrec; // �ش� ���ڵ� ���� �ð�
			auto rectype = tid_rectypes[tid];
			if (rectype == 'W') { // wav
				if (!gz.fetch(nsamp, datalen)) goto next_packet;
				auto srate = tid_srates[tid];
				if (srate > 0) dt_rec_end += nsamp / srate;
			}
			else if (rectype != 'N' && rectype != 'S') { // �������� �ʴ� Ÿ��
				goto next_packet;
			}
			tids.insert(tid); // ���� ���ڵ尡 �ִ� �͵鸸 ����ؾ��ϹǷ�

			// ���� �ð�, ���� �ð��� ������Ʈ
			if (dtstart > dtrec) dtstart = dtrec;
			if (dtend < dt_rec_end) dtend = dt_rec_end;
		}

	next_packet:
		if (!gz.skip(datalen)) break;
	}

	gz.rewind(); // �ι�° parsing�� ���� �� ����

	if (!gz.skip(10 + headerlen)) return -1; // ����� �ǳʶ�

	// �޸𸮷� �� �ø���
	map<unsigned short, vector<pair<double, float>>*> nums;
	map<unsigned short, vector<pair<double, string>>*> strs;
	map<unsigned short, float*> wavs; // ��ü Ʈ������ �ϳ��� ����
	for (auto tid : tids) { // �̸� ���͸� �����Ͽ� ��Ը� �������� �̵��� �����Ѵ�.
		auto rectype = tid_rectypes[tid];
		if (rectype == 'W') {
			long wav_trk_len = ceil((dtend - dtstart) * tid_srates[tid]); // �޸𸮸� �ѹ��� �Ҵ�
			wavs[tid] = new float[wav_trk_len];
			::fill(wavs[tid], wavs[tid] + wav_trk_len, FLT_MAX); // FLT_MAX for blank
		}
		else if (rectype == 'N') {
			nums[tid] = new vector<pair<double, float>>();
		}
		else if (rectype == 'S') {
			strs[tid] = new vector<pair<double, string>>();
		}
	}

	while (!gz.eof()) {// body�� �ٽ� parsing
		unsigned char type = 0; if (!gz.read(&type, 1)) break;
		unsigned long datalen = 0; if (!gz.read(&datalen, 4)) break;
		unsigned long fmtsize = 4;
		char rectype = 0;
		unsigned char recfmt = 0;
		double srate = 0.0;
		unsigned long nsamp = 0;

		if (!packed && datalen > 1000000) break;
		if (type != 1) { goto next_packet2; } // �̹����� ���ڵ常 ����

		infolen = 0; if (!gz.fetch(infolen, datalen)) goto next_packet2;
		dtrec = 0; if (!gz.fetch(dtrec, datalen)) goto next_packet2;
		tid = 0; if (!gz.fetch(tid, datalen)) goto next_packet2;
		if (!tid) goto next_packet2; // tid�� ������ ������� ����

		// Ʈ�� �Ӽ��� ������
		rectype = tid_rectypes[tid];
		srate = tid_srates[tid];
		if (rectype == 'W') if (!gz.fetch(nsamp, datalen)) { goto next_packet2; }

		recfmt = tid_recfmts[tid]; // 1:flt,2:dbl,3:ch,4:byte,5:short,6:word,7:long,8:dword
		switch (recfmt) {
		case 2: fmtsize = 8; break;
		case 3: case 4: fmtsize = 1; break;
		case 5: case 6: fmtsize = 2; break;
		}

		if (rectype == 'W') { // wav
			// ��� wav Ʈ���� dtstart ���� �����Ѵ�. �׷��� ���� �� �ִ�.
			long idxrec = (dtrec - dtstart) * srate;
			auto gain = tid_gains[tid];
			auto bias = tid_biases[tid];
			if (!wavs[tid]) goto next_packet2;
			for (long i = 0; i < nsamp; i++) { // �� ���ÿ� ����
				auto idxrow = idxrec + i; // �� sample�� �ε���
				float fval = FLT_MAX; // ��� ���̺� ������ float �� ��ȯ�ȴ�
				switch (recfmt) {
				case 1: { // float
					if (!gz.fetch(fval, datalen)) { goto next_packet2; }
					break;
				}
				case 2: { // double
					double dval = NAN;
					if (!gz.fetch(fval, datalen)) { goto next_packet2; }
					fval = dval;
					break;
				}
				case 3: {
					char ival = 0;
					if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					fval = ival;
					break;
				}
				case 4: {
					unsigned char ival = 0;
					if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					fval = ival;
					break;
				}
				case 5: {
					short ival = 0;
					if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					fval = ival;
					break;
				}
				case 6: {
					unsigned short ival = 0;
					if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					fval = ival;
					break;
				}
				case 7: {
					long ival = 0;
					if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					fval = ival;
					break;
				}
				case 8: {
					unsigned long ival = 0;
					if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					fval = ival;
					break;
				}
				}
				wavs[tid][idxrow] = fval * gain + bias;
			}
		}
		else if (rectype == 'N') { // num
			float fval; if (!gz.fetch(fval, datalen)) { goto next_packet2; }
			if (nums[tid]) nums[tid]->push_back(make_pair(dtrec, fval));
		}
		else if (rectype == 'S') { // str
			if (!gz.skip(4, datalen)) { goto next_packet2; }
			string sval; if (!gz.fetch_with_len(sval, datalen)) { goto next_packet2; }
			if (strs[tid]) strs[tid]->push_back(make_pair(dtrec, sval));
		}

	next_packet2:
		if (!gz.skip(datalen)) break;
	}

	// tid ����
	/*//random_device rd;
	//mt19937_64 rnd(rd());
	map<unsigned long, string> tid_otids;
	for (auto tid : tids) {
		if (tid_otids.find(tid) != tid_otids.end()) continue;
		//unsigned long long otid = rnd();
		//otid &= LLONG_MAX; // signed 64bit ���� ���ϴ� ��츦 ���� �Ѻ�Ʈ ����
		//string_format("%016llx", otid);
		tid_otids[tid] = sha1(filename + '/' + tid_dnames[tid] + '/' + tid_tnames[tid]);
	}
	*/

	// ��� Ʈ���� ������
	map<unsigned short, unsigned long> tid_datasizes;
	map<unsigned short, unsigned long> tid_compsizes;
	for (auto tid : tids) {
		auto opath = odir + '/' + filename + '@' + tid_dnames[tid] + '@' + tid_tnames[tid] + ".csv.gz";
		//auto opath = odir + "/" + tid_otids[tid] + ".csv.gz";

		// gzip ����� ���̳ʸ��� ����
		GZWriter gz(opath.c_str(), "w5b");

		// ����� ����
		{
			string str = "Time," + tid_dnames[tid] + '/' + tid_tnames[tid] + '\n';
			gz.write(str);
		}

		auto rectype = tid_rectypes[tid];
		unsigned long num_samples = 0;
		if (rectype == 'N') {
			auto& recs = nums[tid];
			sort(recs->begin(), recs->end()); // �ð����� ����
			for (auto& rec : *recs) {
				auto str = num_to_str(rec.first - dtstart);
				str += ',';
				str += num_to_str(rec.second);
				str += '\n';
				num_samples++;
				gz.write(str);
			}
		}
		else if (rectype == 'S') {
			auto& recs = strs[tid];
			sort(recs->begin(), recs->end()); // �ð����� ����
			for (auto& rec : *recs) {
				auto str = num_to_str(rec.first - dtstart);
				str += ',';
				str += escape_csv(rec.second);
				str += '\n';
				num_samples++;
				gz.write(str);
			}
		}
		else if (rectype == 'W') { // ��� ������ �� �࿡ �ϳ��� �������� �� ���� ����
			auto& v = wavs[tid];
			auto srate = tid_srates[tid];
			long wav_trk_len = ceil((dtend - dtstart) * srate); // �޸𸮸� �ѹ��� �Ҵ�
			auto pstart = wavs[tid];
			if (!pstart) continue;
			auto pend = pstart + wav_trk_len;
			unsigned long i = 0;
			for (auto* p = pstart; p < pend; p++) { // ���̺� Ʈ���� �ѹ��� ��
				string str;
				if (i < 2 || (p + 1 == pend)) { // ó�� 2�� ��� ������ �ุ �ð��� ����
					str += num_to_str(i / srate);
				}
				str += ',';
				if (FLT_MAX != *p) { // ���� ��ȯ
					str += num_to_str(*p); // �ּ� 4�ڸ� �ػ󵵰� �ʿ��ϴ�
					num_samples++;
				}
				str += '\n';
				gz.write(str);
				i++;
			}

			wavs[tid] = nullptr;
			delete[] pstart; // �迭 ����
		}
		
		tid_samples[tid] = num_samples;
		tid_datasizes[tid] = gz.get_datasize();
		tid_compsizes[tid] = gz.get_compsize();
	}

	// Ʈ�� ������ ������
	auto f = ::fopen((odir + "/tracklist.csv").c_str(), "wt");
	fprintf(f, "tname,samples,unit,mindisp,maxdisp,colors,datasize,compsize,rectype,srate,gain,bias\n");
	if (f) {
		for (auto tid : tids) {
			// tid, type(n,w,s), trkname, srate
			fprintf(f, "%s,%u,%s,%f,%f,%u,%u,%u,%c,%f,%f,%f\n",
				//tid_otids[tid].c_str(), 
				(tid_dnames[tid] + '/' + tid_tnames[tid]).c_str(), tid_samples[tid],
				tid_units[tid].c_str(), tid_mindisps[tid], tid_maxdisps[tid], tid_colors[tid],
				tid_datasizes[tid], tid_compsizes[tid], tid_rectypes[tid], tid_srates[tid], tid_gains[tid], tid_biases[tid]);
		}
		::fclose(f);
	}

	for (auto it : wavs) if (it.second) delete it.second;
	for (auto it : nums) if (it.second) delete it.second;
	for (auto it : strs) if (it.second) delete it.second;

	return 0;
}
