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
#include <set> 
#include "GZReader.h"
#include "Util.h"
using namespace std;

static const uint64_t crc64_tab[256] = {
	UINT64_C(0x0000000000000000), UINT64_C(0x7ad870c830358979),
	UINT64_C(0xf5b0e190606b12f2), UINT64_C(0x8f689158505e9b8b),
	UINT64_C(0xc038e5739841b68f), UINT64_C(0xbae095bba8743ff6),
	UINT64_C(0x358804e3f82aa47d), UINT64_C(0x4f50742bc81f2d04),
	UINT64_C(0xab28ecb46814fe75), UINT64_C(0xd1f09c7c5821770c),
	UINT64_C(0x5e980d24087fec87), UINT64_C(0x24407dec384a65fe),
	UINT64_C(0x6b1009c7f05548fa), UINT64_C(0x11c8790fc060c183),
	UINT64_C(0x9ea0e857903e5a08), UINT64_C(0xe478989fa00bd371),
	UINT64_C(0x7d08ff3b88be6f81), UINT64_C(0x07d08ff3b88be6f8),
	UINT64_C(0x88b81eabe8d57d73), UINT64_C(0xf2606e63d8e0f40a),
	UINT64_C(0xbd301a4810ffd90e), UINT64_C(0xc7e86a8020ca5077),
	UINT64_C(0x4880fbd87094cbfc), UINT64_C(0x32588b1040a14285),
	UINT64_C(0xd620138fe0aa91f4), UINT64_C(0xacf86347d09f188d),
	UINT64_C(0x2390f21f80c18306), UINT64_C(0x594882d7b0f40a7f),
	UINT64_C(0x1618f6fc78eb277b), UINT64_C(0x6cc0863448deae02),
	UINT64_C(0xe3a8176c18803589), UINT64_C(0x997067a428b5bcf0),
	UINT64_C(0xfa11fe77117cdf02), UINT64_C(0x80c98ebf2149567b),
	UINT64_C(0x0fa11fe77117cdf0), UINT64_C(0x75796f2f41224489),
	UINT64_C(0x3a291b04893d698d), UINT64_C(0x40f16bccb908e0f4),
	UINT64_C(0xcf99fa94e9567b7f), UINT64_C(0xb5418a5cd963f206),
	UINT64_C(0x513912c379682177), UINT64_C(0x2be1620b495da80e),
	UINT64_C(0xa489f35319033385), UINT64_C(0xde51839b2936bafc),
	UINT64_C(0x9101f7b0e12997f8), UINT64_C(0xebd98778d11c1e81),
	UINT64_C(0x64b116208142850a), UINT64_C(0x1e6966e8b1770c73),
	UINT64_C(0x8719014c99c2b083), UINT64_C(0xfdc17184a9f739fa),
	UINT64_C(0x72a9e0dcf9a9a271), UINT64_C(0x08719014c99c2b08),
	UINT64_C(0x4721e43f0183060c), UINT64_C(0x3df994f731b68f75),
	UINT64_C(0xb29105af61e814fe), UINT64_C(0xc849756751dd9d87),
	UINT64_C(0x2c31edf8f1d64ef6), UINT64_C(0x56e99d30c1e3c78f),
	UINT64_C(0xd9810c6891bd5c04), UINT64_C(0xa3597ca0a188d57d),
	UINT64_C(0xec09088b6997f879), UINT64_C(0x96d1784359a27100),
	UINT64_C(0x19b9e91b09fcea8b), UINT64_C(0x636199d339c963f2),
	UINT64_C(0xdf7adabd7a6e2d6f), UINT64_C(0xa5a2aa754a5ba416),
	UINT64_C(0x2aca3b2d1a053f9d), UINT64_C(0x50124be52a30b6e4),
	UINT64_C(0x1f423fcee22f9be0), UINT64_C(0x659a4f06d21a1299),
	UINT64_C(0xeaf2de5e82448912), UINT64_C(0x902aae96b271006b),
	UINT64_C(0x74523609127ad31a), UINT64_C(0x0e8a46c1224f5a63),
	UINT64_C(0x81e2d7997211c1e8), UINT64_C(0xfb3aa75142244891),
	UINT64_C(0xb46ad37a8a3b6595), UINT64_C(0xceb2a3b2ba0eecec),
	UINT64_C(0x41da32eaea507767), UINT64_C(0x3b024222da65fe1e),
	UINT64_C(0xa2722586f2d042ee), UINT64_C(0xd8aa554ec2e5cb97),
	UINT64_C(0x57c2c41692bb501c), UINT64_C(0x2d1ab4dea28ed965),
	UINT64_C(0x624ac0f56a91f461), UINT64_C(0x1892b03d5aa47d18),
	UINT64_C(0x97fa21650afae693), UINT64_C(0xed2251ad3acf6fea),
	UINT64_C(0x095ac9329ac4bc9b), UINT64_C(0x7382b9faaaf135e2),
	UINT64_C(0xfcea28a2faafae69), UINT64_C(0x8632586aca9a2710),
	UINT64_C(0xc9622c4102850a14), UINT64_C(0xb3ba5c8932b0836d),
	UINT64_C(0x3cd2cdd162ee18e6), UINT64_C(0x460abd1952db919f),
	UINT64_C(0x256b24ca6b12f26d), UINT64_C(0x5fb354025b277b14),
	UINT64_C(0xd0dbc55a0b79e09f), UINT64_C(0xaa03b5923b4c69e6),
	UINT64_C(0xe553c1b9f35344e2), UINT64_C(0x9f8bb171c366cd9b),
	UINT64_C(0x10e3202993385610), UINT64_C(0x6a3b50e1a30ddf69),
	UINT64_C(0x8e43c87e03060c18), UINT64_C(0xf49bb8b633338561),
	UINT64_C(0x7bf329ee636d1eea), UINT64_C(0x012b592653589793),
	UINT64_C(0x4e7b2d0d9b47ba97), UINT64_C(0x34a35dc5ab7233ee),
	UINT64_C(0xbbcbcc9dfb2ca865), UINT64_C(0xc113bc55cb19211c),
	UINT64_C(0x5863dbf1e3ac9dec), UINT64_C(0x22bbab39d3991495),
	UINT64_C(0xadd33a6183c78f1e), UINT64_C(0xd70b4aa9b3f20667),
	UINT64_C(0x985b3e827bed2b63), UINT64_C(0xe2834e4a4bd8a21a),
	UINT64_C(0x6debdf121b863991), UINT64_C(0x1733afda2bb3b0e8),
	UINT64_C(0xf34b37458bb86399), UINT64_C(0x8993478dbb8deae0),
	UINT64_C(0x06fbd6d5ebd3716b), UINT64_C(0x7c23a61ddbe6f812),
	UINT64_C(0x3373d23613f9d516), UINT64_C(0x49aba2fe23cc5c6f),
	UINT64_C(0xc6c333a67392c7e4), UINT64_C(0xbc1b436e43a74e9d),
	UINT64_C(0x95ac9329ac4bc9b5), UINT64_C(0xef74e3e19c7e40cc),
	UINT64_C(0x601c72b9cc20db47), UINT64_C(0x1ac40271fc15523e),
	UINT64_C(0x5594765a340a7f3a), UINT64_C(0x2f4c0692043ff643),
	UINT64_C(0xa02497ca54616dc8), UINT64_C(0xdafce7026454e4b1),
	UINT64_C(0x3e847f9dc45f37c0), UINT64_C(0x445c0f55f46abeb9),
	UINT64_C(0xcb349e0da4342532), UINT64_C(0xb1eceec59401ac4b),
	UINT64_C(0xfebc9aee5c1e814f), UINT64_C(0x8464ea266c2b0836),
	UINT64_C(0x0b0c7b7e3c7593bd), UINT64_C(0x71d40bb60c401ac4),
	UINT64_C(0xe8a46c1224f5a634), UINT64_C(0x927c1cda14c02f4d),
	UINT64_C(0x1d148d82449eb4c6), UINT64_C(0x67ccfd4a74ab3dbf),
	UINT64_C(0x289c8961bcb410bb), UINT64_C(0x5244f9a98c8199c2),
	UINT64_C(0xdd2c68f1dcdf0249), UINT64_C(0xa7f41839ecea8b30),
	UINT64_C(0x438c80a64ce15841), UINT64_C(0x3954f06e7cd4d138),
	UINT64_C(0xb63c61362c8a4ab3), UINT64_C(0xcce411fe1cbfc3ca),
	UINT64_C(0x83b465d5d4a0eece), UINT64_C(0xf96c151de49567b7),
	UINT64_C(0x76048445b4cbfc3c), UINT64_C(0x0cdcf48d84fe7545),
	UINT64_C(0x6fbd6d5ebd3716b7), UINT64_C(0x15651d968d029fce),
	UINT64_C(0x9a0d8ccedd5c0445), UINT64_C(0xe0d5fc06ed698d3c),
	UINT64_C(0xaf85882d2576a038), UINT64_C(0xd55df8e515432941),
	UINT64_C(0x5a3569bd451db2ca), UINT64_C(0x20ed197575283bb3),
	UINT64_C(0xc49581ead523e8c2), UINT64_C(0xbe4df122e51661bb),
	UINT64_C(0x3125607ab548fa30), UINT64_C(0x4bfd10b2857d7349),
	UINT64_C(0x04ad64994d625e4d), UINT64_C(0x7e7514517d57d734),
	UINT64_C(0xf11d85092d094cbf), UINT64_C(0x8bc5f5c11d3cc5c6),
	UINT64_C(0x12b5926535897936), UINT64_C(0x686de2ad05bcf04f),
	UINT64_C(0xe70573f555e26bc4), UINT64_C(0x9ddd033d65d7e2bd),
	UINT64_C(0xd28d7716adc8cfb9), UINT64_C(0xa85507de9dfd46c0),
	UINT64_C(0x273d9686cda3dd4b), UINT64_C(0x5de5e64efd965432),
	UINT64_C(0xb99d7ed15d9d8743), UINT64_C(0xc3450e196da80e3a),
	UINT64_C(0x4c2d9f413df695b1), UINT64_C(0x36f5ef890dc31cc8),
	UINT64_C(0x79a59ba2c5dc31cc), UINT64_C(0x037deb6af5e9b8b5),
	UINT64_C(0x8c157a32a5b7233e), UINT64_C(0xf6cd0afa9582aa47),
	UINT64_C(0x4ad64994d625e4da), UINT64_C(0x300e395ce6106da3),
	UINT64_C(0xbf66a804b64ef628), UINT64_C(0xc5bed8cc867b7f51),
	UINT64_C(0x8aeeace74e645255), UINT64_C(0xf036dc2f7e51db2c),
	UINT64_C(0x7f5e4d772e0f40a7), UINT64_C(0x05863dbf1e3ac9de),
	UINT64_C(0xe1fea520be311aaf), UINT64_C(0x9b26d5e88e0493d6),
	UINT64_C(0x144e44b0de5a085d), UINT64_C(0x6e963478ee6f8124),
	UINT64_C(0x21c640532670ac20), UINT64_C(0x5b1e309b16452559),
	UINT64_C(0xd476a1c3461bbed2), UINT64_C(0xaeaed10b762e37ab),
	UINT64_C(0x37deb6af5e9b8b5b), UINT64_C(0x4d06c6676eae0222),
	UINT64_C(0xc26e573f3ef099a9), UINT64_C(0xb8b627f70ec510d0),
	UINT64_C(0xf7e653dcc6da3dd4), UINT64_C(0x8d3e2314f6efb4ad),
	UINT64_C(0x0256b24ca6b12f26), UINT64_C(0x788ec2849684a65f),
	UINT64_C(0x9cf65a1b368f752e), UINT64_C(0xe62e2ad306bafc57),
	UINT64_C(0x6946bb8b56e467dc), UINT64_C(0x139ecb4366d1eea5),
	UINT64_C(0x5ccebf68aecec3a1), UINT64_C(0x2616cfa09efb4ad8),
	UINT64_C(0xa97e5ef8cea5d153), UINT64_C(0xd3a62e30fe90582a),
	UINT64_C(0xb0c7b7e3c7593bd8), UINT64_C(0xca1fc72bf76cb2a1),
	UINT64_C(0x45775673a732292a), UINT64_C(0x3faf26bb9707a053),
	UINT64_C(0x70ff52905f188d57), UINT64_C(0x0a2722586f2d042e),
	UINT64_C(0x854fb3003f739fa5), UINT64_C(0xff97c3c80f4616dc),
	UINT64_C(0x1bef5b57af4dc5ad), UINT64_C(0x61372b9f9f784cd4),
	UINT64_C(0xee5fbac7cf26d75f), UINT64_C(0x9487ca0fff135e26),
	UINT64_C(0xdbd7be24370c7322), UINT64_C(0xa10fceec0739fa5b),
	UINT64_C(0x2e675fb4576761d0), UINT64_C(0x54bf2f7c6752e8a9),
	UINT64_C(0xcdcf48d84fe75459), UINT64_C(0xb71738107fd2dd20),
	UINT64_C(0x387fa9482f8c46ab), UINT64_C(0x42a7d9801fb9cfd2),
	UINT64_C(0x0df7adabd7a6e2d6), UINT64_C(0x772fdd63e7936baf),
	UINT64_C(0xf8474c3bb7cdf024), UINT64_C(0x829f3cf387f8795d),
	UINT64_C(0x66e7a46c27f3aa2c), UINT64_C(0x1c3fd4a417c62355),
	UINT64_C(0x935745fc4798b8de), UINT64_C(0xe98f353477ad31a7),
	UINT64_C(0xa6df411fbfb21ca3), UINT64_C(0xdc0731d78f8795da),
	UINT64_C(0x536fa08fdfd90e51), UINT64_C(0x29b7d047efec8728),
};

uint64_t crc64(string& s) {
	uint64_t crc = 0;
	for (char c : s) {
		crc = crc64_tab[(uint8_t)crc ^ (uint8_t)c] ^ (crc >> 8);
	}
	return crc;
}

void print_usage(const char* progname) {
	fprintf(stderr, "Usage : %s INPUT_FILENAME [OUTPUT_FOLDER]\n\n", basename(progname).c_str());
}

/*
trks
trkid, trkname

nums
- 숫자값
- caseid, trkid, val

wavs
- wave 1초 단위로 자름
- caseid, trkid, val

strs
- 문자열값
- caseid, trkid, val
*/
int main(int argc, char* argv[]) {
	srand(time(nullptr));

	const char* progname = argv[0];
	argc--; argv++; // 자기 자신의 실행 파일명 제거

	if (argc < 1) { // 최소 1개의 입력 (파일명)은 있어야함
		print_usage(progname);
		return -1;
	}

	string filename = argv[0];
	string caseid = basename(filename);
	auto dotpos = caseid.rfind('.');
	if (dotpos != -1) caseid = caseid.substr(0, dotpos);
	
	string odir = ".";
	if (argc > 1) odir = argv[1];
	GZReader gz(argv[0]); // 파일을 열어
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

	short dgmt;
	if (headerlen >= 2) {
		if (!gz.read(&dgmt, sizeof(dgmt))) return -1;
		headerlen -= 2;
	}

	if (!gz.skip(headerlen)) return -1;
	headerlen += 2; // 아래에서 재사용 하기 위해

	// 한 번 훑으면서 트랙 이름, 시작 시간, 종료 시각 구함
	map<unsigned short, double> tid_dtstart; // 트랙의 시작 시간
	map<unsigned short, double> tid_dtend; // 트랙의 종료 시간
	map<unsigned long, string> did_dnames;
	map<unsigned short, unsigned char> rectypes; // 1:wav,2:num,5:str
	map<unsigned short, unsigned char> recfmts;
	map<unsigned short, double> gains;
	map<unsigned short, double> offsets;
	map<unsigned short, float> srates;
	map<unsigned short, string> tid_tnames;
	map<unsigned short, string> tid_dnames;
	set<unsigned short> tids;

	double dtstart = DBL_MAX;
	double dtend = 0;

	while (!gz.eof()) { // body는 패킷의 연속이다.
		unsigned char type; if (!gz.read(&type, 1)) break;
		unsigned long datalen; if (!gz.read(&datalen, 4)) break;
		if(datalen > 1000000) break;

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
			if (!gz.fetch(tname, datalen)) goto next_packet;
			if (!gz.fetch(unit, datalen)) goto save_and_next_packet;
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
		}

		if (type == 9) { // devinfo
			unsigned long did; if (!gz.fetch(did, datalen)) goto next_packet;
			string dtype; if (!gz.fetch(dtype, datalen)) goto next_packet;
			string dname; if (!gz.fetch(dname, datalen)) goto next_packet;
			if (dname.empty()) dname = dtype;
			did_dnames[did] = dname;
		} else if (type == 1) { // rec
			unsigned short infolen; if (!gz.fetch(infolen, datalen)) goto next_packet;
			double dt_rec_start; if (!gz.fetch(dt_rec_start, datalen)) goto next_packet;
			if (!dt_rec_start) goto next_packet;
			unsigned short tid; if (!gz.fetch(tid, datalen)) goto next_packet;

			tids.insert(tid);

			// 트랙 속성을 가져옴
			unsigned char rectype = rectypes[tid]; // 1:wav,2:num,3:str
			float srate = srates[tid];
			unsigned long nsamp = 0;
			double dt_rec_end = dt_rec_start; // 해당 레코드 종료 시간
			if (rectype == 1) { // wav
				if (!gz.fetch(nsamp, datalen)) goto next_packet;
				if(srate > 0) dt_rec_end += nsamp / srate;
			}

			// 시작 시간, 종료 시간을 업데이트
			if (tid_dtstart[tid] > dt_rec_start) tid_dtstart[tid] = dt_rec_start;
			if (tid_dtend[tid] < dt_rec_end) tid_dtend[tid] = dt_rec_end;
			if (dtstart > dt_rec_start) dtstart = dt_rec_start;
			if (dtend < dt_rec_end) dtend = dt_rec_end;
		} 

next_packet:
		if (!gz.skip(datalen)) break;
	}

	gz.rewind(); // 되 감음

	if (!gz.skip(10 + headerlen)) return -1; // 헤더를 건너뜀
	
	// 메모리로 다 올리자
	map<unsigned short, vector<pair<double, float>>> nums;
	map<unsigned short, vector<pair<double, string>>> strs;
	map<unsigned short, vector<float>> wavs; // 전체 트랙별로 하나씩 생성
	for (auto tid : tids) { // 미리 벡터를 생성하여 대규모 데이터의 이동을 방지한다.
		nums[tid] = vector<pair<double, float>>();
		strs[tid] = vector<pair<double, string>>();
		wavs[tid] = vector<float>();
		//int trk_start_int = floor(tid_dtstart[tid]);
		//int trk_end_int = floor(tid_dtstart[tid]);
		//wavs[tid]->resize();
	}

	while (!gz.eof()) {// body를 다시 parsing
		unsigned char type; if (!gz.read(&type, 1)) break;
		unsigned long datalen; if (!gz.read(&datalen, 4)) break;
		if(datalen > 1000000) break;
		if (type != 1) { goto next_packet2; } // 이번에는 레코드만 읽음

		unsigned short infolen; if (!gz.fetch(infolen, datalen)) goto next_packet2;
		double dt_rec_start; if (!gz.fetch(dt_rec_start, datalen)) goto next_packet2;
		unsigned short tid; if (!gz.fetch(tid, datalen)) goto next_packet2; 
		if (!tid) goto next_packet2; // tid가 없으면 출력하지 않음
		if (dt_rec_start < tid_dtstart[tid]) goto next_packet2;

		// 트랙 속성을 가져옴
		unsigned char rectype = rectypes[tid]; // 1:wav,2:num,3:str
		float srate = srates[tid];
		unsigned long nsamp = 0;
		if (rectype == 1) if (!gz.fetch(nsamp, datalen)) { goto next_packet2; }
		unsigned char recfmt = recfmts[tid]; // 1:flt,2:dbl,3:ch,4:byte,5:short,6:word,7:long,8:dword
		unsigned int fmtsize = 4;
		switch (recfmt) {
		case 2: fmtsize = 8; break;
		case 3: case 4: fmtsize = 1; break;
		case 5: case 6: fmtsize = 2; break;
		}
		double gain = gains[tid];
		double offset = offsets[tid];

		if (rectype == 1) { // wav
/*			int idxlast = -1;
			for (int i = 0; i < nsamp; i++) {
				int idxrow = (dt_rec_start + (double)i / srate - dtstart) / epoch; // 현 sample의 인덱스
				if (idxrow < 0) { goto next_packet2; }
				if (idxrow >= nrows) { goto next_packet2; }

				if (idxrow == idxlast) { // 같은 행을 다시 채크하지 않기 위해
					if (!gz.skip(fmtsize, datalen)) break;
					continue;
				}
				idxlast = idxrow;

				if (!rows[idxrow][idxcol]) {
					string sval;
					switch (recfmt) {
					case 1: {
						float fval; if (!gz.fetch(fval, datalen)) { goto next_packet2; }
						sval = string_format("%f", fval);
						break;
					}
					case 2: {
						double fval; if (!gz.fetch(fval, datalen)) { goto next_packet2; }
						sval = string_format("%lf", fval);
						break;
					}
					case 3: {
						char ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
						float fval = ival * gain + offset;
						sval = string_format("%f", fval);
						break;
					}
					case 4: {
						unsigned char ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
						float fval = ival * gain + offset;
						sval = string_format("%f", fval);
						break;
					}
					case 5: {
						short ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
						float fval = ival * gain + offset;
						sval = string_format("%f", fval);
						break;
					}
					case 6: {
						unsigned short ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
						float fval = ival * gain + offset;
						sval = string_format("%f", fval);
						break;
					}
					case 7: {
						long ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
						float fval = ival * gain + offset;
						sval = string_format("%f", fval);
						break;
					}
					case 8: {
						unsigned long ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
						float fval = ival * gain + offset;
						sval = string_format("%f", fval);
						break;
					}
					}
					rows[idxrow][idxcol] = new string(sval);
					hasdata[idxcol] = true;
				}
			}
*/
		} else if (rectype == 2) { // num
			float fval; if (!gz.fetch(fval, datalen)) { goto next_packet2; }
			nums[tid].push_back(make_pair(dt_rec_start, fval));
		} else if (rectype == 5) { // str
			if (!gz.skip(4, datalen)) { goto next_packet2; }
			string sval; if (!gz.fetch(sval, datalen)) { goto next_packet2; }
			strs[tid].push_back(make_pair(dt_rec_start, sval));
		}
		
next_packet2:
		if (!gz.skip(datalen)) break;
	}

	map<unsigned short, uint64_t> tid_tid64;
	char buf[256];
	for (auto tid : tids) {
		itoa(tid, buf, 10);
		tid_tid64[tid] = crc64(caseid + buf);
	}

	// 결과를 저장할 파일 생성
	auto f = ::fopen((odir + "/" + caseid + ".trks").c_str(), "wt");
	// 트랙 정보를 저장함
	for (auto tid : tids) {
		fprintf(f, "\"%s\",%llu,\"%s/%s\"\n", caseid.c_str(), tid_tid64[tid], tid_dnames[tid].c_str(), tid_tnames[tid].c_str());
	}
	::fclose(f);

	// 숫자값을 저장함
	f = ::fopen((odir + "/" + caseid + ".nums").c_str(), "wt");
	for (auto it : nums) {
		auto& tid = it.first;
		auto& recs = it.second;
		for (auto& rec : recs) {
			fprintf(f, "%llu,%f,%f\n", tid_tid64[tid], rec.first, rec.second);
		}
	}
	::fclose(f);

	f = ::fopen((odir + "/" + caseid + ".wavs").c_str(), "wt");
	::fclose(f);

	f = ::fopen((odir + "/" + caseid + ".strs").c_str(), "wt");
	::fclose(f);

	return 0;
}
