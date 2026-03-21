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
	fprintf(stderr, "Usage : %s -OPTIONS INPUT_FILENAME INTERVAL [DNAME/TNAME]\n\n\
OPTIONS : one or many of the followings. ex) -rlt\n\
  a : print human readable time\n\
  u : print unix timestamp\n\
  r : all tracks should be exists\n\
  l : replace blank value with the last value\n\
  h : print header at the first row\n\
  c : print filename at the first column\n\
  n : print the closest value from the start of the time interval as a representative\n\
  m : print mean value as a representative for numeric and wave tracks\n\
  d : print device name\n\
  s : skip blank rows\n\n\
INPUT_FILENAME : vital file name\n\n\
INTERVAL : time interval of each row in sec. default = 1. ex) 1/100\n\n\
DEVNAME/TRKNAME : comma seperated device and track name list. ex) BIS/BIS,BIS/SEF\n\
  if omitted, all tracks are exported.\n\n", basename(progname).c_str());
}

double minval(vector<double>& v) {
	double ret = DBL_MAX;
	for (int i = 0; i < v.size(); i++)
		if (v[i] < ret)
			ret = v[i];
	return ret;
}

double maxval(vector<double>& v) {
	double ret = DBL_MIN;
	for (long i = 0; i < v.size(); i++)
		if (v[i] > ret)
			ret = v[i];
	return ret;
}

// c++�� string ��ü�� �þ ���� ����� �޸𸮸� ����� �Ҵ��Ѵ�.
// �׷��� �̴� �ſ� ū vital ���� �����͸� ������ �� �޸� ���� ������ ����Ŵ
// visual c++�� shrink_to_fit �Լ��� ����� ���� ����
// ���� C ǥ�� ���ڿ��� �ٲ�
char* cstr(const string& s) {
	auto ret = new char[s.size() + 1];
	copy(s.begin(), s.end(), ret);
	ret[s.size()] = '\0';
	return ret;
}

int main(int argc, char* argv[]) {
	const char* progname = argv[0];
	argc--; argv++; // �ڱ� �ڽ��� ���� ���ϸ� ����

	bool absolute_time = false;
	bool unix_time = false;
	bool all_required = false;
	bool fill_last = false;
	bool print_header = false;
	bool print_filename = false;
	bool print_mean = false;
	bool print_dname = false;
	bool print_closest = false;
	bool skip_blank_row = false;
	if (argc > 0) {
		string opts(argv[0]);
		if (opts.substr(0, 1) == "-") {
			argc--; argv++;
			if (opts.find('a') != -1) absolute_time = true;
			if (opts.find('u') != -1) unix_time = true;
			if (opts.find('r') != -1) all_required = true;
			if (opts.find('l') != -1) fill_last = true;
			if (opts.find('h') != -1) print_header = true;
			if (opts.find('c') != -1) print_filename = true;
			if (opts.find('m') != -1) print_mean = true;
			if (opts.find('s') != -1) skip_blank_row = true;
			if (opts.find('n') != -1) print_closest = true;
			if (opts.find('d') != -1) print_dname = true;
		}
	}

	double epoch = 1.0; // ����ڰ� ������ �ð� ����
	if (argc < 1) { // �ּ� 1���� �Է� (���ϸ�)�� �־����
		print_usage(progname);
		return -1;
	}

	////////////////////////////////////////////////////////////
	// parse epoch
	////////////////////////////////////////////////////////////
	if (argc >= 2) {
		string sspan(argv[1]);
		long pos = sspan.find('/');
		epoch = atof(sspan.c_str());
		if (pos > 0) {
			double divider = atof(sspan.substr(pos + 1).c_str());
			if (divider == 0) {
				fprintf(stderr, "divider of [TIMESPAN] should not be 0\n");
				return -1;
			}
			epoch /= divider;
		}
	}
	if (!epoch) {
		fprintf(stderr, "[TIMESPAN] should be > 0\n");
		return -1;
	}

	////////////////////////////////////////////////////////////
	// parse dname/tname
	////////////////////////////////////////////////////////////
	vector<string> tnames; // �÷��� ����� Ʈ����
	vector<string> dnames; // �÷��� ����� ����
	vector<unsigned short> tids; // �÷��� ����� tid

	bool alltrack = true;
	if (argc >= 3) {
		alltrack = false;
		tnames = explode(argv[2], ',');
		long ncols = tnames.size();
		tids.resize(ncols);
		dnames.resize(ncols);
		for (long j = 0; j < ncols; j++) {
			long pos = tnames[j].find('/');
			if (pos != -1) {// devname �� ����
				dnames[j] = tnames[j].substr(0, pos);
				tnames[j] = tnames[j].substr(pos + 1);
			}
		}
	}

	string filename = argv[0];

	GZReader gz(argv[0]); // ������ ����
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

	// �� �� ����
	// ù ��°������ Ʈ�� �̸���
	// ��ü ���� �ð� �� ���� �ð� �� ����
	map<unsigned short, double> tid_dtstart; // Ʈ���� ���� �ð�
	map<unsigned short, double> tid_dtend; // Ʈ���� ���� �ð�
	map<unsigned long, string> did_dnames;
	map<unsigned short, unsigned char> rectypes; // 1:wav,2:num,5:str
	map<unsigned short, unsigned char> recfmts; // 
	map<unsigned short, double> gains;
	map<unsigned short, double> offsets;
	map<unsigned short, float> srates;
	map<unsigned short, string> tid_tnames;
	map<unsigned short, string> tid_dnames;
	map<unsigned short, long> tid_col;
	map<unsigned short, bool> tid_used;

	while (!gz.eof()) { // body�� ��Ŷ�� �����̴�.
		unsigned char type; if (!gz.read(&type, 1)) break;
		unsigned long datalen; if (!gz.read(&datalen, 4)) break;
		if(!packed && datalen > 1000000) break;

		// tname, tid, dname, did, type (NUM, STR, WAV), srate
		if (type == 0) { // trkinfo
			unsigned short tid; if (!gz.fetch(tid, datalen)) goto next_packet;
			unsigned char rectype; if (!gz.fetch(rectype, datalen)) goto next_packet;
			unsigned char recfmt; if (!gz.fetch(recfmt, datalen)) goto next_packet;
			string tname, unit; 
			float minval, maxval, srate; 
			unsigned long col, did;
			double adc_gain, adc_offset;
			unsigned char montype;
			if (!gz.fetch_with_len(tname, datalen)) goto next_packet;
			if (!gz.fetch_with_len(unit, datalen)) goto save_and_next_packet;
			if (!gz.fetch(minval, datalen)) goto save_and_next_packet;
			if (!gz.fetch(maxval, datalen)) goto save_and_next_packet;
			if (!gz.fetch(col, datalen)) goto save_and_next_packet;
			if (!gz.fetch(srate, datalen)) goto save_and_next_packet;
			if (!gz.fetch(adc_gain, datalen)) goto save_and_next_packet;
			if (!gz.fetch(adc_offset, datalen)) goto save_and_next_packet; 
			if (!gz.fetch(montype, datalen)) goto save_and_next_packet;
			if (!gz.fetch(did, datalen)) goto save_and_next_packet;

		save_and_next_packet:
			string dname = did_dnames[did];
			tid_tnames[tid] = tname;
			tid_dnames[tid] = dname;
			rectypes[tid] = rectype;
			recfmts[tid] = recfmt;
			gains[tid] = adc_gain;
			offsets[tid] = adc_offset;
			srates[tid] = srate;
			tid_dtstart[tid] = DBL_MAX;
			tid_dtend[tid] = 0.0;

			if (!alltrack) { // �����Ͱ� ���� �ϵ�, �������� �ʵ� �׻� �Էµ� tname ������ ����Ѵ�.
				long col = -1;
				for (int i = 0; i < tnames.size(); i++) {
					if (tnames[i] == tname	)
						if (dnames[i].empty() || dnames[i] == dname) {
							col = i;
							break;
						}
				}
				if (col == -1) continue;
				tids[col] = tid;
				tid_col[tid] = col;
			}
		} else if (type == 9) { // devinfo
			unsigned long did; if (!gz.fetch(did, datalen)) goto next_packet;
			string dtype; if (!gz.fetch_with_len(dtype, datalen)) goto next_packet;
			string dname; if (!gz.fetch_with_len(dname, datalen)) goto next_packet;
			if (dname.empty()) dname = dtype;
			did_dnames[did] = dname;
		} else if (type == 1) { // rec
			unsigned short infolen; if (!gz.fetch(infolen, datalen)) goto next_packet;
			double dt_rec_start; if (!gz.fetch(dt_rec_start, datalen)) goto next_packet;
			if (!dt_rec_start) goto next_packet;
			unsigned short tid; if (!gz.fetch(tid, datalen)) goto next_packet;

			// Ʈ�� �Ӽ��� ������
			unsigned char rectype = rectypes[tid]; // 1:wav,2:num,3:str
			float srate = srates[tid];
			unsigned long nsamp = 0;
			double dt_rec_end = dt_rec_start; // �ش� ���ڵ� ���� �ð�
			if (rectype == 1) { // wav
				if (!gz.fetch(nsamp, datalen)) goto next_packet;
				if(srate > 0) dt_rec_end += nsamp / srate;
			}

			if (alltrack && !tid_used[tid]) { // ��� ����ϴ� ��쿡�� ó�� ������ �� ������ ���Ѵ�.
				long col = tnames.size();
				tnames.push_back(tid_tnames[tid]); // �����ϴ� ������� tnames�� �������
				dnames.push_back(tid_dnames[tid]);
				tids.push_back(tid);
				tid_col[tid] = col;
				tid_used[tid] = true;
			}

			// ���� �ð�, ���� �ð��� ������Ʈ
			if (tid_dtstart[tid] > dt_rec_start) tid_dtstart[tid] = dt_rec_start;
			if (tid_dtend[tid] < dt_rec_end) tid_dtend[tid] = dt_rec_end;
		} 

next_packet:
		if (!gz.skip(datalen)) break;
	}

	double dtstart = 0;
	double dtend = 0;
	vector<double> dtstarts, dtends;
	for (auto tid : tids) {
		if (!tid) continue;
		dtstarts.push_back(tid_dtstart[tid]);
		dtends.push_back(tid_dtend[tid]);
	}
	
	if (dtstarts.empty() || dtends.empty()) {
		fprintf(stderr, "No data\n");
		return -1;
	}

	if (all_required) {// ��� Ʈ���� �����ؾ���
		// ��� Ʈ���� dtstart �� �ִ� ���� dtend �� �ּұ���
		dtstart = maxval(dtstarts);
		dtend = minval(dtends); // �ϳ��� �������� ������ dtstart = DBL_MAX, dtend = 0 �� �ȴ�.
	} else {
		// ��� Ʈ���� dtstart �� �ּ� ���� dtend �� �ִ� ����
		dtstart = minval(dtstarts);
		dtend = maxval(dtends);
	}

	if (dtend <= dtstart) {
		fprintf(stderr, "No data\n");
		return -1;
	}
	if (dtend - dtstart > 48 * 3600) {
		fprintf(stderr, "Data duration > 48 hrs\n");
		return -1;
	}

	gz.rewind(); // �� ����
	if (!gz.skip(10 + headerlen)) return -1; // ����� �ǳʶ�
											 
	// ����� ������ ����Ʈ�� ����
	long ncols = tids.size();
	long nrows = ceil((dtend - dtstart) / epoch);

	// ��� ������ �޸𸮷� �ø� �غ�
	// ������ �� �ڶ� ���� ���� �ð��� �����Ͱ� �� �� �ֱ� ������ ��ü�� �޸𸮷� �÷��� �Ѵ�.
	vector<char*> vals(ncols * nrows);

	// ��� ����� ���� ���
	vector<double> sums;
	vector<long> cnts;
	if (print_mean) {
		sums.resize(ncols * nrows);
		cnts.resize(ncols * nrows);
	}

	// ���� ����� �� ����� ���� ���
	vector<double> dists;
	if (print_closest) {
		dists.resize(ncols * nrows);
		fill(dists.begin(), dists.end(), DBL_MAX);
	}

	///////////////////////////////////////////
	// body�� �ٽ� parsing �ϸ鼭 ������ ����
	///////////////////////////////////////////
	vector<bool> has_data_in_col(ncols);
	vector<bool> has_data_in_row(nrows);
	while (!gz.eof()) {// body�� �ٽ� parsing
		unsigned char type; if (!gz.read(&type, 1)) break;
		unsigned long datalen; if (!gz.read(&datalen, 4)) break;
		if(!packed && datalen > 1000000) break;
		if (type != 1) { goto next_packet2; } // �̹����� ���ڵ常 ����

		unsigned short infolen; if (!gz.fetch(infolen, datalen)) goto next_packet2;
		double dt_rec_start; if (!gz.fetch(dt_rec_start, datalen)) goto next_packet2;
		if (dt_rec_start < dtstart) goto next_packet2; 
		unsigned short tid; if (!gz.fetch(tid, datalen)) goto next_packet2; 
		if (tid_col.find(tid) == tid_col.end()) goto next_packet2; // tid�� ������ ������� ����
		unsigned long icol = tid_col[tid];

		// Ʈ�� �Ӽ��� ������
		unsigned char rectype = rectypes[tid]; // 1:wav,2:num,3:str
		float srate = srates[tid];
		unsigned long nsamp = 0;
		if (rectype == 1) if (!gz.fetch(nsamp, datalen)) { goto next_packet2; }
		unsigned char recfmt = recfmts[tid]; // 1:flt,2:dbl,3:ch,4:byte,5:short,6:word,7:long,8:dword
		unsigned long fmtsize = 4;
		switch (recfmt) {
		case 2: fmtsize = 8; break;
		case 3: case 4: fmtsize = 1; break;
		case 5: case 6: fmtsize = 2; break;
		}
		double gain = gains[tid];
		double offset = offsets[tid];

		if (rectype == 1) { // wav
			for (long i = 0; i < nsamp; i++) { // wave���� �� ���ÿ� ����
				// �� sample�� ��� �࿡ ���ϴ°�?
				// closest �� ��쿡�� �ݿø��ϰ� �������� �׳� interval ���� ���� ���õ鸸 ���
				double frow = (dt_rec_start + (double)i / srate - dtstart) / epoch;
				long irow = frow + (print_closest ? 0.5 : 0.0);
				if (irow < 0) { goto next_packet2; }
				if (irow >= nrows) { goto next_packet2; }

				// �̹� ������ ó���� �������� �ſ� ������ �Ǵ��ؾ���
				bool skip_this_sample = true;
				if (print_closest) { // closest �� ��쿡�� ���� distance ���� ����� ��츸 ó��
					double fdist = fabs(frow - irow);
					if (fdist < dists[irow * ncols + icol]) {
						dists[irow * ncols + icol] = fdist;
						skip_this_sample = false;
					}
				} else if (print_mean) { // ����� ��쿡�� ��� ������ ó��
					skip_this_sample = false;
				} else { // �� ���� ��쿡�� ���� ���� ���� ��츸 ó��
					skip_this_sample = vals[irow * ncols + icol];
				}

				// �̹� ������ �ǳ� ��
				if (skip_this_sample) {
					if (!gz.skip(fmtsize, datalen)) break;
					continue;
				}

				string sval;
				float fval;
				switch (recfmt) {
				case 1: { // float
					float v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					sval = string_format("%f", v);
					fval = v;
					break;
				}
				case 2: { // double
					double v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					sval = string_format("%lf", v);
					fval = v;
					break;
				}
				case 3: { // char
					char v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				case 4: { // byte
					unsigned char v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				case 5: { // short
					short v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				case 6: { // word
					unsigned short v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				case 7: { // long
					long v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				case 8: { // dword
					unsigned long v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				}
				
				if (print_mean) {
					sums[irow * ncols + icol] += fval;
					cnts[irow * ncols + icol] ++;
				} else {
					vals[irow * ncols + icol] = cstr(sval);
				}
				has_data_in_col[icol] = true;
				has_data_in_row[irow] = true;
			}
		} else if (rectype == 2) { // num
			double frow = (dt_rec_start - dtstart) / epoch;
			long irow = frow + (print_closest ? 0.5 : 0.0);
			if (irow < 0) { goto next_packet2; }
			if (irow >= nrows) { goto next_packet2; }
			
			// �̹� ������ ó���� �������� �ſ� ������ �Ǵ��ؾ���
			bool skip_this_sample = true;
			if (print_closest) { // closest �� ��쿡�� ���� distance ���� ����� ��츸 ó��
				double fdist = fabs(frow - irow);
				if (fdist < dists[irow * ncols + icol]) {
					dists[irow * ncols + icol] = fdist;
					skip_this_sample = false;
				}
			} else if (print_mean) { // ����� ��쿡�� ��� ������ ó��
				skip_this_sample = false;
			} else { // �� ���� ��쿡�� ���� ���� ���� ��츸 ó��
				skip_this_sample = vals[irow * ncols + icol] != nullptr;
			}

			if (skip_this_sample) { goto next_packet2; }

			float fval; if (!gz.fetch(fval, datalen)) { goto next_packet2; }
			if (print_mean) {
				sums[irow * ncols + icol] += fval;
				cnts[irow * ncols + icol] ++;
			} else {
				vals[irow * ncols + icol] = cstr(string_format("%f", fval));
			}
			
			has_data_in_col[icol] = true;
			has_data_in_row[irow] = true;
		} else if (rectype == 5) { // str
			double frow = (dt_rec_start - dtstart) / epoch;
			long irow = frow + (print_closest ? 0.5 : 0.0);
			if (irow < 0) { goto next_packet2; }
			if (irow >= nrows) { goto next_packet2; }

			// �̹� ������ ó���� �������� �ſ� ������ �Ǵ��ؾ���
			bool skip_this_sample = true;
			if (print_closest) { // closest �� ��쿡�� ���� distance ���� ����� ��츸 ó��
				double fdist = fabs(frow - irow);
				if (fdist < dists[irow * ncols + icol]) {
					dists[irow * ncols + icol] = fdist;
					skip_this_sample = false;
				}
			} else { // �� ���� ��쿡�� ���� ���� ���� ��츸 ó��
				skip_this_sample = vals[irow * ncols + icol] != nullptr;
			}

			if (skip_this_sample) { goto next_packet2; }

			if (!gz.skip(4, datalen)) { goto next_packet2; }
			string sval; if (!gz.fetch_with_len(sval, datalen)) { goto next_packet2; }
			vals[irow * ncols + icol] = cstr(escape_csv(sval));
			has_data_in_col[icol] = true;
			has_data_in_row[irow] = true;
		}
		
next_packet2:
		if (!gz.skip(datalen)) break;
	}

	if(all_required) // �� ������ �����Ͱ� ������?
		for (long j = 0; j < ncols; j++)
			if (!has_data_in_col[j]) {
				fprintf(stderr, "No data\n");
				return -1;
			}


	///////////////////////////////////////////////////////
	// �б� ����, ����� ���
	///////////////////////////////////////////////////////
	if (print_mean) {
		for (long i = 0; i < nrows; i++) {
			for (long j = 0; j < ncols; j++) {
				if (cnts[i * ncols + j]) {
					double m = sums[i * ncols + j] / cnts[i * ncols + j];
					vals[i * ncols + j] = cstr(string_format("%f", m));
				}
			}
		}
	}

	// ��� ���� ���
	if (print_header) {
		if (print_filename) printf("Filename,"); // �ڿ� time�� �ݵ�� �����Ƿ� , �� �ٿ��� ����
		printf("Time"); // Ʈ������ ���
		for (long j = 0; j < ncols; j++) {
			string str = tnames[j];
			if (print_dname && !dnames[j].empty()) str = dnames[j] + "/" + str;
			putchar(',');
			printf(str.c_str());
		}
		putchar('\n');
	}

	vector<char*> lastval(ncols); // �� �÷��� ������ ��
	for (long i = 0; i < nrows; i++) { // �� ���� �����͸� ���
		if (skip_blank_row) {
			if (!has_data_in_row[i]) continue;
		}

		double dt = dtstart + i * epoch;

		if (print_filename) {
			printf(basename(filename).c_str());
			putchar(','); // �ڿ� time�� �ݵ�� �����Ƿ� , �� �ٿ��� ����
		}

		// �ð��� ���
		if (absolute_time) {
			time_t t_local = (time_t)dt - dgmt * 60;
			tm * ts = gmtime(&t_local);
			printf("%04d-%02d-%02d %02d:%02d:%02d.%03d", ts->tm_year + 1900, ts->tm_mon + 1, ts->tm_mday, ts->tm_hour, ts->tm_min, ts->tm_sec, (__int64)((dt - (__int64)dt) * 1000));
		}
		else if (unix_time) {
			printf("%lf", dt);
		}
		else {
			printf("%lf", dt - dtstart);
		}

		// ���� ���
		for (long j = 0; j < ncols; j++) {
			auto val = vals[i * ncols + j];
			if (fill_last) {
				if (!val) val = lastval[j]; // ���� ������ ������ ���� ���
				else lastval[j] = val; // ���� ������ �� ���� ������ ������ ĳ��
			}
			if (val) printf(",%s", val);
			else putchar(',');
		}

		putchar('\n');
	}

	for (auto p : vals)
		if(p) delete [] p;

	return 0;
}