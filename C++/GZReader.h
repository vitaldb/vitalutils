#pragma once
#define BUFLEN 16384
#include <string>
#include <vector>
#include <zlib.h>
using namespace std;

class GZWriter {
public:
	GZWriter(const char* path) {
		fi = gzopen(path, "wb");
		if (fi) opened_path = path;
	}

	virtual ~GZWriter() {
		if (fi) gzclose(fi);
	}

protected:
	gzFile fi;
	string opened_path;

public:
	bool write(const void* buf, unsigned int len) {
		return gzwrite(fi, buf, len) > 0;
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
		if (gzwrite(fi, &len, sizeof(len)) <= 0) return false;
		return write(&s[0], len);
	}
	bool opened() const {
		return fi != 0;
	}
};

class GZReader {
public:
	GZReader(const char* path) {
		fi = gzopen(path, "rb");
		if (fi) opened_path = path;
	}

	virtual ~GZReader() {
		if(fi) gzclose(fi);
	}

protected:
	gzFile fi;
	string opened_path;
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
			unsigned int unzippedBytes = gzread(fi, fi_buf, BUFLEN); // 추가로 읽어들임
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
		return -1 != gzseek(fi, len, SEEK_CUR);
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
		
		z_off_t nskip = gzseek(fi, len, SEEK_CUR);
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

	bool fetch(string& x, unsigned long& remain) {
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
		return fi != 0;
	}

	bool eof() const {
		return gzeof(fi) && !fi_remain;
	}

	void rewind() {
		gzrewind(fi);
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
	bool fetch(string& x) {
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
