#pragma once
#include <mutex>
#include <list>
#include <functional>

using namespace std;
#pragma warning (disable: 4786)
#pragma warning (disable: 4748)
#pragma warning (disable: 4103)

// 멀티 스레드 safe list
// std::list는 thread safe 하지 않음
// 큐에 포인터를 저장하고 있었다면 큐 삭제시 해당 포인터가 가리키는 객체는 삭제되지 않는다. 알아서 삭제해야함`
template <typename T>
class Queue {
private:
	list<T> m_list;
	mutex m_mutex;

public:
	Queue() = default;
	virtual ~Queue() { Clear();}

private:
	Queue(const Queue&) = delete;
	Queue& operator = (const Queue&) = delete;

public:
	void Clear() {
		lock_guard<mutex> lk(m_mutex);
		m_list.clear();
	}

	// Enqueue
	void Push(const T& newval) {
		lock_guard<mutex> lk(m_mutex);
		m_list.push_back(newval);
	}

	void RemoveIf(std::function<bool (const T&)> tester) {
		for (auto i = m_list.begin(); i != m_list.end(); ) {
			if (tester(*i)) {
				lock_guard<mutex> lk(m_mutex);
				i = m_list.erase(i);
			} else {
				++i;
			}
		}
	}

	// Dequeue, pass a pointer by reference
	bool Pop(T& val) {
		lock_guard<mutex> lk(m_mutex);
		if (m_list.empty()) return false;
		
		auto it = m_list.begin();
		val = *it;
		m_list.pop_front();

		return true;
	}

	// for accurate sizes change the code to use the Interlocked functions calls
	size_t GetSize() { return m_list.size(); }
	bool IsEmpty() { return m_list.empty(); }
};
