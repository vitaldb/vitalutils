#pragma once
#define BUFLEN 8192
#include <string>
#include <vector>
#include <zlib.h>
using namespace std;

class GZBuffer {
private:
	unsigned char buf_in[BUFLEN];
	unsigned int buf_in_pos = 0;
	unsigned char buf_out[BUFLEN];
	z_stream strm = { 0, };
public:
	vector<unsigned char> m_comp; // 압축된 결과

public:
	GZBuffer() {
		deflateInit2(&strm, Z_BEST_SPEED, Z_DEFLATED, MAX_WBITS + 16, 8, Z_DEFAULT_STRATEGY);
	}
	virtual ~GZBuffer() {
		deflateEnd(&strm);
	}

public:
	void flush() {
		// 남은 버퍼를 저장
		if (buf_in_pos) {
			strm.next_in = (Bytef*)buf_in;
			strm.avail_in = buf_in_pos;
			strm.next_out = (Bytef*)buf_out;
			strm.avail_out = BUFLEN;

			// 실제 압축
			deflate(&strm, Z_FINISH);

			// 남은 버퍼 꺼내옴
			auto have = BUFLEN - strm.avail_out;
			m_comp.insert(m_comp.end(), buf_out, buf_out + have);
		}
	}

	size_t size() const {
		return m_comp.size();
	}

	bool save(const string& path) {
		flush();

		if (m_comp.empty()) return false;
		auto f = ::fopen(path.c_str(), "wb");
		if (!f) return false;
		bool ret = (fwrite(&m_comp[0], m_comp.size(), 1, f) > 0);
		fclose(f);
		return ret;
	}

	bool write(const void* buf, unsigned long len) { 
		unsigned long bufpos = 0;
		while (bufpos < len) {
			auto copy = BUFLEN - buf_in_pos; // 이번에 최대 복사할 수 있는 양
			if (copy > len - bufpos) { // 남은 데이터가 그만큼 없으면
				copy = len - bufpos; // 복사만 하고 압축은 다음에
			}

			// 해당 양을 복사함
			memcpy(buf_in + buf_in_pos, (char*)buf + bufpos, copy);
			bufpos += copy;
			buf_in_pos += copy;

			// 버퍼가 다 찼다
			if (buf_in_pos == BUFLEN) { // 실제 압축
				strm.next_in = (Bytef*)buf_in;
				strm.avail_in = BUFLEN;
				strm.next_out = (Bytef*)buf_out;
				strm.avail_out = BUFLEN;
				if (Z_OK != deflate(&strm, Z_NO_FLUSH)) return false;

				// 전부 꺼내옴 (압축했으므로 buflen 이하이다)
				auto have = BUFLEN - strm.avail_out;
				if (have) m_comp.insert(m_comp.end(), buf_out, buf_out + have);

				buf_in_pos = 0;
			}
		}
		return true;
	}
	bool write(const double& f) {
		return write(&f, sizeof(f));
	}
	bool write(const float& f) {
		return write(&f, sizeof(f));
	}
	bool write(unsigned char& b) {
		return write(&b, sizeof(b));
	}
	bool write(const string& s) {
		unsigned long len = s.size();
		if (!write(&len, sizeof(len))) return false;
		return write(&s[0], len);
	}
	bool opened() const {
		return true;
	}
};

class GZWriter {
public:
	GZWriter(const char* path, const char* mode = "w1b") {
		m_fi = gzopen(path, mode);
	}

	virtual ~GZWriter() {
		close();
	}

public:
	size_t get_datasize() const {
		return gztell(m_fi);
	}
	size_t get_compsize() const {
		gzflush(m_fi, Z_FINISH);
		return gzoffset(m_fi) + 20; // 20바이트 헤더
	}

	void close() {
		if (m_fi) gzclose(m_fi);
		m_fi = nullptr;
	}

protected:
	gzFile m_fi;

public:
	bool write(const string& s) {
		return gzwrite(m_fi, &s[0], s.size()) > 0;
	}
	bool write(const void* buf, unsigned long len) {
		return gzwrite(m_fi, buf, len) > 0;
	}
	bool write(const double& f) {
		return write(&f, sizeof(f));
	}
	bool write(const float& f) {
		return write(&f, sizeof(f));
	}
	bool write(unsigned char& b) {
		return write(&b, sizeof(b));
	}
	bool write(char& c) {
		return write(&c, sizeof(c));
	}
	bool write(short& s) {
		return write(&s, sizeof(s));
	}
	bool write(unsigned short& v) {
		return write(&v, sizeof(v));
	}
	bool write(long& b) {
		return write(&b, sizeof(b));
	}
	bool write(unsigned long& b) {
		return write(&b, sizeof(b));
	}
	bool write_with_len(const string& s) {
		unsigned long len = s.size();
		if (!write(&len, sizeof(len))) return false;
		return write(&s[0], len);
	}
	bool opened() const {
		return m_fi != 0;
	}
};

class GZReader {
public:
	GZReader(const char* path) {
		m_fi = gzopen(path, "rb");
	}

	virtual ~GZReader() {
		if(m_fi) gzclose(m_fi);
	}

protected:
	gzFile m_fi;
	unsigned long fi_remain = 0; // 읽은게 없으므로
	unsigned char fi_buf[BUFLEN]; // 현재 남은 데이터
	const unsigned char* fi_ptr = fi_buf; // fi_buf에서 현재 읽을 포인터
										  // 정확히 len byte를 읽음. 다 읽으면 true, 1바이트라도 못읽으면 false를 리턴
public:
	unsigned long read(void* dest, unsigned long len) {
		unsigned char* buf = (unsigned char*)dest;
		if (!buf) return 0;
		unsigned long nread = 0;
		while (len > 0) {
			if (len <= fi_remain) { // 남은것만 다 읽어도 충분하면?
				memcpy(buf, fi_ptr, len); // 복사하고 리턴
				fi_remain -= len;
				fi_ptr += len;
				nread += len;
				break;
			} else if (fi_remain) { // 부족하면?
				memcpy(buf, fi_ptr, fi_remain); // 일단 있는것을 다 읽음
				len -= fi_remain;
				buf += fi_remain;
				nread += fi_remain;
			}
			unsigned long unzippedBytes = gzread(m_fi, fi_buf, BUFLEN); // 추가로 읽어들임
			if (!unzippedBytes) return nread; // 더이상 읽을게 없으면
			fi_remain = unzippedBytes;
			fi_ptr = fi_buf;
		}
		return nread;
	}

	bool skip(unsigned long len) {
		if (len <= fi_remain) {
			fi_remain -= len;
			fi_ptr += len;
			return true;
		} else if (fi_remain) {
			len -= fi_remain;
			fi_remain = 0;
		}
		return -1 != gzseek(m_fi, len, SEEK_CUR);
	}

	bool skip(unsigned long len, unsigned long& remain) {
		if (remain < len) return false;
		if (len <= fi_remain) {
			fi_remain -= len;
			fi_ptr += len;
			remain -= len;
			return true;
		} else if (fi_remain) {
			len -= fi_remain;
			remain -= fi_remain;
			fi_remain = 0;
		}
		
		z_off_t nskip = gzseek(m_fi, len, SEEK_CUR);
		if (-1 == nskip) return false;
		remain -= len;
		return true;
	}

	// x를 읽고 remain을 감소시킴
	bool fetch(long& x, unsigned long& remain) {
		if (remain < sizeof(x)) return false;
		unsigned long nread = read(&x, sizeof(x));
		remain -= nread;
		return (nread == sizeof(x));
	}

	bool fetch(unsigned long& x, unsigned long& remain) {
		if (remain < sizeof(x)) return false;
		unsigned long nread = read(&x, sizeof(x));
		remain -= nread;
		return (nread == sizeof(x));
	}

	bool fetch(float& x, unsigned long& remain) {
		if (remain < sizeof(x)) return false;
		unsigned long nread = read(&x, sizeof(x));
		remain -= nread;
		return (nread == sizeof(x));
	}

	bool fetch(double& x, unsigned long& remain) {
		if (remain < sizeof(x)) return false;
		unsigned long nread = read(&x, sizeof(x));
		remain -= nread;
		return (nread == sizeof(x));
	}

	bool fetch(short& x, unsigned long& remain) {
		if (remain < sizeof(x)) return false;
		unsigned long nread = read(&x, sizeof(x));
		remain -= nread;
		return (nread == sizeof(x));
	}

	bool fetch(unsigned short& x, unsigned long& remain) {
		if (remain < sizeof(x)) return false;
		unsigned long nread = read(&x, sizeof(x));
		remain -= nread;
		return (nread == sizeof(x));
	}

	bool fetch(char& x, unsigned long& remain) {
		if (remain < sizeof(x)) return false;
		unsigned long nread = read(&x, sizeof(x));
		remain -= nread;
		return (nread == sizeof(x));
	}

	bool fetch(unsigned char& x, unsigned long& remain) {
		if (remain < sizeof(x)) return false;
		unsigned long nread = read(&x, sizeof(x));
		remain -= nread;
		return (nread == sizeof(x));
	}

	bool fetch_with_len(string& x, unsigned long& remain) {
		unsigned long strlen; 
		if (!fetch(strlen, remain)) return false;
		if (strlen >= 1048576) {// > 1MB
			return false;
		}
		x.resize(strlen);
		unsigned long nread = read(&x[0], strlen);
		remain -= nread;
		return (nread == strlen);
	}

	bool opened() const {
		return m_fi != 0;
	}

	bool eof() const {
		return gzeof(m_fi) && !fi_remain;
	}

	void rewind() {
		gzrewind(m_fi);
		fi_remain = 0;
		fi_ptr = fi_buf;
	}
};

class BUF : public vector<unsigned char> {
	unsigned long pos = 0;
public:
	BUF(unsigned long len = 0) : vector<unsigned char>(len) { pos = 0; }
	void skip(unsigned long len) {
		pos += len;
	}
	void skip_str() {
		unsigned long strlen;
		if (!fetch(strlen)) return;
		pos += strlen;
	}
	bool fetch(void* p, unsigned long len) {
		if (size() < pos + len) {
			pos = size();
			return false;
		}
		memcpy(p, &(*this)[pos], len); // 그 외에는 무조건 복사 가능
		pos += len;
		return true;
	}
	bool fetch(unsigned char& x) {
		if (size() < pos + sizeof(x)) {
			pos = size();
			return false;
		}
		memcpy(&x, &(*this)[pos], sizeof(x)); // 그 외에는 무조건 복사 가능
		pos += sizeof(x);
		return true;
	}
	bool fetch(unsigned short& x) {
		if (size() < pos + sizeof(x)) {
			pos = size();
			return false;
		}
		memcpy(&x, &(*this)[pos], sizeof(x)); // 그 외에는 무조건 복사 가능
		pos += sizeof(x);
		return true;
	}
	bool fetch(unsigned long& x) {
		if (size() < pos + sizeof(x)) {
			pos = size();
			return false;
		}
		memcpy(&x, &(*this)[pos], sizeof(x)); // 그 외에는 무조건 복사 가능
		pos += sizeof(x);
		return true;
	}
	bool fetch(float& x) {
		if (size() < pos + sizeof(x)) {
			pos = size();
			return false;
		}
		memcpy(&x, &(*this)[pos], sizeof(x)); // 그 외에는 무조건 복사 가능
		pos += sizeof(x);
		return true;
	}
	bool fetch(double& x) {
		if (size() < pos + sizeof(x)) {
			pos = size();
			return false;
		}
		memcpy(&x, &(*this)[pos], sizeof(x)); // 그 외에는 무조건 복사 가능
		pos += sizeof(x);
		return true;
	}
	bool fetch_with_len(string& x) {
		unsigned long strlen;
		if (!fetch(strlen)) return false;
		if (strlen >= 1048576) {// > 1MB
			return false;
		}
		x.resize(strlen);
		if (size() < pos + strlen) {
			pos = size();
			return false;
		}
		memcpy(&x[0], &(*this)[pos], strlen);
		pos += strlen;
		return true;
	}
};
